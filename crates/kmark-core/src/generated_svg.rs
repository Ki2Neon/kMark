use cssparser::{Parser, ParserInput, Token};
use quick_xml::{
    events::{BytesEnd, BytesRef, BytesStart, BytesText, Event},
    Reader, Writer, XmlVersion,
};
use std::{collections::HashMap, fmt};

pub const MAX_GENERATED_SVG_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GeneratedSvgPresentation {
    pub root_style: Option<String>,
    pub position: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GeneratedSvgError {
    TooLarge { bytes: usize },
    InvalidXml(String),
    Unsafe(String),
}

impl GeneratedSvgError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::TooLarge { .. } => "generated_svg_too_large",
            Self::InvalidXml(_) => "generated_svg_invalid_xml",
            Self::Unsafe(_) => "generated_svg_unsafe",
        }
    }
}

impl fmt::Display for GeneratedSvgError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooLarge { bytes } => write!(
                formatter,
                "generated SVG is {bytes} bytes; maximum is {MAX_GENERATED_SVG_BYTES} bytes"
            ),
            Self::InvalidXml(message) | Self::Unsafe(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for GeneratedSvgError {}

pub fn finalize_generated_svg(
    raw_svg: &str,
    render_id: &str,
    presentation: &GeneratedSvgPresentation,
    https_hosts: &[String],
) -> Result<String, GeneratedSvgError> {
    if raw_svg.len() > MAX_GENERATED_SVG_BYTES {
        return Err(GeneratedSvgError::TooLarge {
            bytes: raw_svg.len(),
        });
    }
    if render_id.is_empty()
        || render_id.len() > 128
        || !render_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(GeneratedSvgError::Unsafe(
            "generated SVG render id is invalid".to_owned(),
        ));
    }

    let id_map = inspect_svg(raw_svg, render_id)?;
    rewrite_svg(raw_svg, render_id, presentation, https_hosts, &id_map)
}

fn inspect_svg(
    raw_svg: &str,
    render_id: &str,
) -> Result<HashMap<String, String>, GeneratedSvgError> {
    let mut reader = Reader::from_str(raw_svg);
    reader.config_mut().trim_text(false);
    let mut depth = 0usize;
    let mut root_count = 0usize;
    let mut id_map = HashMap::new();
    let mut next_id = 0usize;

    loop {
        match reader.read_event() {
            Ok(Event::Start(element)) => {
                if depth == 0 {
                    validate_root(&element)?;
                    root_count += 1;
                }
                collect_element_id(
                    &reader,
                    &element,
                    depth == 0,
                    render_id,
                    &mut next_id,
                    &mut id_map,
                )?;
                depth += 1;
            }
            Ok(Event::Empty(element)) => {
                if depth == 0 {
                    validate_root(&element)?;
                    root_count += 1;
                }
                collect_element_id(
                    &reader,
                    &element,
                    depth == 0,
                    render_id,
                    &mut next_id,
                    &mut id_map,
                )?;
            }
            Ok(Event::End(_)) => {
                if depth == 0 {
                    return Err(GeneratedSvgError::InvalidXml(
                        "generated SVG contains an unmatched closing element".to_owned(),
                    ));
                }
                depth -= 1;
            }
            Ok(Event::Text(text)) if depth == 0 => {
                let value = text
                    .decode()
                    .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?;
                if !value.trim().is_empty() {
                    return Err(GeneratedSvgError::InvalidXml(
                        "generated SVG contains text outside the root element".to_owned(),
                    ));
                }
            }
            Ok(Event::CData(text)) if depth == 0 => {
                if !String::from_utf8_lossy(text.as_ref()).trim().is_empty() {
                    return Err(GeneratedSvgError::InvalidXml(
                        "generated SVG contains text outside the root element".to_owned(),
                    ));
                }
            }
            Ok(Event::GeneralRef(_)) if depth == 0 => {
                return Err(GeneratedSvgError::InvalidXml(
                    "generated SVG contains a reference outside the root element".to_owned(),
                ));
            }
            Ok(Event::DocType(_) | Event::PI(_)) => {
                return Err(GeneratedSvgError::Unsafe(
                    "generated SVG contains a forbidden declaration".to_owned(),
                ));
            }
            Ok(
                Event::Text(_)
                | Event::CData(_)
                | Event::GeneralRef(_)
                | Event::Decl(_)
                | Event::Comment(_),
            ) => {}
            Ok(Event::Eof) => break,
            Err(error) => return Err(GeneratedSvgError::InvalidXml(error.to_string())),
        }
    }

    if depth != 0 || root_count != 1 {
        return Err(GeneratedSvgError::InvalidXml(
            "generated SVG must contain exactly one SVG root".to_owned(),
        ));
    }

    Ok(id_map)
}

fn validate_root(element: &BytesStart<'_>) -> Result<(), GeneratedSvgError> {
    if !local_name(element.name().as_ref()).eq_ignore_ascii_case(b"svg") {
        return Err(GeneratedSvgError::InvalidXml(
            "generated SVG root element must be svg".to_owned(),
        ));
    }
    Ok(())
}

fn collect_element_id(
    reader: &Reader<&[u8]>,
    element: &BytesStart<'_>,
    is_root: bool,
    render_id: &str,
    next_id: &mut usize,
    id_map: &mut HashMap<String, String>,
) -> Result<(), GeneratedSvgError> {
    for attribute in element.attributes().with_checks(true) {
        let attribute =
            attribute.map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?;
        if !local_name(attribute.key.as_ref()).eq_ignore_ascii_case(b"id") {
            continue;
        }
        let value = attribute
            .decoded_and_normalized_value(XmlVersion::Implicit1_0, reader.decoder())
            .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?
            .into_owned();
        if value.is_empty() || id_map.contains_key(&value) {
            return Err(GeneratedSvgError::Unsafe(
                "generated SVG contains an empty or duplicate id".to_owned(),
            ));
        }
        if is_root {
            id_map.insert(value, format!("kmark-svg-{render_id}"));
        } else {
            *next_id += 1;
            id_map.insert(value, format!("kmark-{render_id}-id-{next_id}"));
        }
    }
    Ok(())
}

fn rewrite_svg(
    raw_svg: &str,
    render_id: &str,
    presentation: &GeneratedSvgPresentation,
    https_hosts: &[String],
    id_map: &HashMap<String, String>,
) -> Result<String, GeneratedSvgError> {
    let mut reader = Reader::from_str(raw_svg);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(raw_svg.len()));
    let root_id = format!("kmark-svg-{render_id}");
    let mut depth = 0usize;
    let mut suppressed_depth = 0usize;
    let mut foreign_depth = 0usize;
    let mut style_depth: Option<usize> = None;
    let mut style_text = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(element)) => {
                let qualified_name = element.name();
                let name = local_name(qualified_name.as_ref()).to_ascii_lowercase();
                if suppressed_depth > 0 {
                    suppressed_depth += 1;
                    depth += 1;
                    continue;
                }
                if is_unsafe_element(&name)
                    || (foreign_depth > 0 && !is_safe_foreign_element(&name))
                {
                    suppressed_depth = 1;
                    depth += 1;
                    continue;
                }

                let is_root = depth == 0;
                let rewritten = rewrite_start(
                    &reader,
                    &element,
                    is_root,
                    &root_id,
                    presentation,
                    https_hosts,
                    id_map,
                )?;
                writer
                    .write_event(Event::Start(rewritten))
                    .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?;
                depth += 1;
                if name == b"foreignobject" {
                    foreign_depth += 1;
                }
                if name == b"style" {
                    style_depth = Some(depth);
                    style_text.clear();
                }
            }
            Ok(Event::Empty(element)) => {
                if suppressed_depth > 0 {
                    continue;
                }
                let qualified_name = element.name();
                let name = local_name(qualified_name.as_ref()).to_ascii_lowercase();
                if is_unsafe_element(&name)
                    || (foreign_depth > 0 && !is_safe_foreign_element(&name))
                {
                    continue;
                }
                let rewritten = rewrite_start(
                    &reader,
                    &element,
                    depth == 0,
                    &root_id,
                    presentation,
                    https_hosts,
                    id_map,
                )?;
                writer
                    .write_event(Event::Empty(rewritten))
                    .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?;
            }
            Ok(Event::End(element)) => {
                if depth == 0 {
                    return Err(GeneratedSvgError::InvalidXml(
                        "generated SVG contains an unmatched closing element".to_owned(),
                    ));
                }
                if suppressed_depth > 0 {
                    suppressed_depth -= 1;
                    depth -= 1;
                    continue;
                }
                let qualified_name = element.name();
                let name = local_name(qualified_name.as_ref()).to_ascii_lowercase();
                if style_depth == Some(depth) {
                    let stylesheet =
                        sanitize_stylesheet(&style_text, &root_id, id_map, https_hosts)?;
                    if !stylesheet.is_empty() {
                        writer
                            .write_event(Event::Text(BytesText::new(&stylesheet)))
                            .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?;
                    }
                    style_depth = None;
                    style_text.clear();
                }
                if name == b"foreignobject" {
                    foreign_depth = foreign_depth.saturating_sub(1);
                }
                writer
                    .write_event(Event::End(BytesEnd::new(String::from_utf8_lossy(
                        element.name().as_ref(),
                    ))))
                    .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?;
                depth -= 1;
            }
            Ok(Event::Text(text)) => {
                if suppressed_depth > 0 {
                    continue;
                }
                let value = text
                    .decode()
                    .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?;
                if style_depth.is_some() {
                    style_text.push_str(&value);
                } else {
                    writer
                        .write_event(Event::Text(BytesText::new(&value)))
                        .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?;
                }
            }
            Ok(Event::GeneralRef(reference)) => {
                if suppressed_depth > 0 {
                    continue;
                }
                let value = resolve_general_reference(&reference)?;
                if style_depth.is_some() {
                    style_text.push_str(&value);
                } else {
                    writer
                        .write_event(Event::Text(BytesText::new(&value)))
                        .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?;
                }
            }
            Ok(Event::CData(text)) => {
                if suppressed_depth > 0 {
                    continue;
                }
                let value = String::from_utf8_lossy(text.as_ref());
                if style_depth.is_some() {
                    style_text.push_str(&value);
                } else {
                    writer
                        .write_event(Event::Text(BytesText::new(&value)))
                        .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?;
                }
            }
            Ok(Event::Decl(_)) => {}
            Ok(Event::Comment(_)) => {}
            Ok(Event::DocType(_) | Event::PI(_)) => {
                return Err(GeneratedSvgError::Unsafe(
                    "generated SVG contains a forbidden declaration".to_owned(),
                ));
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(GeneratedSvgError::InvalidXml(error.to_string())),
        }
    }

    String::from_utf8(writer.into_inner())
        .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))
}

fn resolve_general_reference(reference: &BytesRef<'_>) -> Result<String, GeneratedSvgError> {
    let name = reference
        .decode()
        .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?;
    let value = match name.as_ref() {
        "amp" => '&',
        "lt" => '<',
        "gt" => '>',
        "apos" => '\'',
        "quot" => '"',
        _ => reference
            .resolve_char_ref()
            .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?
            .ok_or_else(|| {
                GeneratedSvgError::InvalidXml(
                    "generated SVG contains an unknown entity reference".to_owned(),
                )
            })?,
    };
    if !is_legal_xml_char(value) {
        return Err(GeneratedSvgError::InvalidXml(
            "generated SVG contains an illegal character reference".to_owned(),
        ));
    }
    Ok(value.to_string())
}

fn is_legal_xml_char(value: char) -> bool {
    matches!(value, '\u{9}' | '\u{a}' | '\u{d}')
        || ('\u{20}'..='\u{d7ff}').contains(&value)
        || ('\u{e000}'..='\u{fffd}').contains(&value)
        || ('\u{10000}'..='\u{10ffff}').contains(&value)
}

fn rewrite_start(
    reader: &Reader<&[u8]>,
    element: &BytesStart<'_>,
    is_root: bool,
    root_id: &str,
    presentation: &GeneratedSvgPresentation,
    https_hosts: &[String],
    id_map: &HashMap<String, String>,
) -> Result<BytesStart<'static>, GeneratedSvgError> {
    let element_name = String::from_utf8_lossy(element.name().as_ref()).into_owned();
    let local_element_name =
        String::from_utf8_lossy(local_name(element.name().as_ref())).into_owned();
    let mut attributes = Vec::<(String, String)>::new();
    let mut existing_style = None;

    for attribute in element.attributes().with_checks(true) {
        let attribute =
            attribute.map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?;
        let name = String::from_utf8_lossy(attribute.key.as_ref()).into_owned();
        let local_attribute_name =
            String::from_utf8_lossy(local_name(attribute.key.as_ref())).to_ascii_lowercase();
        if local_attribute_name.starts_with("on") || is_forbidden_attribute(&local_attribute_name) {
            continue;
        }
        let mut value = attribute
            .decoded_and_normalized_value(XmlVersion::Implicit1_0, reader.decoder())
            .map_err(|error| GeneratedSvgError::InvalidXml(error.to_string()))?
            .into_owned();

        match local_attribute_name.as_str() {
            "id" => {
                if is_root {
                    continue;
                }
                value = id_map.get(&value).cloned().ok_or_else(|| {
                    GeneratedSvgError::Unsafe("generated SVG id mapping is inconsistent".to_owned())
                })?;
            }
            "href" | "src" => {
                value = sanitize_href(&local_element_name, &value, https_hosts, id_map)?;
            }
            "style" => {
                existing_style = Some(sanitize_declarations(&value, id_map, https_hosts)?);
                continue;
            }
            "aria-labelledby" | "aria-describedby" => {
                value = value
                    .split_ascii_whitespace()
                    .filter_map(|id| id_map.get(id))
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(" ");
                if value.is_empty() {
                    continue;
                }
            }
            _ => {
                value = rewrite_fragment_urls(&value, id_map, https_hosts)?;
            }
        }
        attributes.push((name, value));
    }

    if is_root {
        attributes.retain(|(name, _)| {
            !matches!(
                String::from_utf8_lossy(local_name(name.as_bytes()))
                    .to_ascii_lowercase()
                    .as_str(),
                "id" | "role" | "preserveaspectratio" | "data-kmark-generated-svg"
            )
        });
        attributes.push(("id".to_owned(), root_id.to_owned()));
        attributes.push(("data-kmark-generated-svg".to_owned(), "true".to_owned()));
        let mut root_style = existing_style.unwrap_or_default();
        if let Some(presentation_style) = presentation.root_style.as_deref() {
            let presentation_style =
                sanitize_declarations(presentation_style, id_map, https_hosts)?;
            if !root_style.is_empty()
                && !presentation_style.is_empty()
                && !root_style.ends_with(';')
            {
                root_style.push(';');
            }
            root_style.push_str(&presentation_style);
        }
        if root_style.contains("transform:") {
            append_declaration(&mut root_style, "transform-box:border-box");
            append_declaration(&mut root_style, "transform-origin:center");
        }
        if root_style.contains("border-radius:") {
            append_declaration(&mut root_style, "overflow:hidden");
        }
        if !root_style.is_empty() {
            attributes.push(("style".to_owned(), root_style));
        }
        if let Some(preserve_aspect_ratio) = preserve_aspect_ratio(presentation.position.as_deref())
        {
            attributes.retain(|(name, _)| !name.eq_ignore_ascii_case("preserveAspectRatio"));
            attributes.push((
                "preserveAspectRatio".to_owned(),
                preserve_aspect_ratio.to_owned(),
            ));
        }
        attributes.push(("role".to_owned(), "img".to_owned()));
    } else if let Some(style) = existing_style.filter(|style| !style.is_empty()) {
        attributes.push(("style".to_owned(), style));
    }

    let mut rewritten = BytesStart::new(element_name);
    for (name, value) in &attributes {
        rewritten.push_attribute((name.as_str(), value.as_str()));
    }
    Ok(rewritten.into_owned())
}

fn sanitize_href(
    element_name: &str,
    value: &str,
    https_hosts: &[String],
    id_map: &HashMap<String, String>,
) -> Result<String, GeneratedSvgError> {
    let trimmed = value.trim();
    if let Some(fragment) = trimmed.strip_prefix('#') {
        return id_map
            .get(fragment)
            .map(|id| format!("#{id}"))
            .ok_or_else(|| {
                GeneratedSvgError::Unsafe("generated SVG references an unknown id".to_owned())
            });
    }
    match element_name.to_ascii_lowercase().as_str() {
        "a" if is_safe_navigation_url(trimmed) => Ok(trimmed.to_owned()),
        "image" if is_allowed_resource_url(trimmed, https_hosts) => Ok(trimmed.to_owned()),
        _ => Err(GeneratedSvgError::Unsafe(
            "generated SVG contains a blocked external reference".to_owned(),
        )),
    }
}

fn sanitize_declarations(
    css: &str,
    id_map: &HashMap<String, String>,
    https_hosts: &[String],
) -> Result<String, GeneratedSvgError> {
    validate_css_tokens(css)?;
    let mut output = String::new();
    for declaration in split_top_level(css, ';')? {
        let declaration = declaration.trim();
        if declaration.is_empty() {
            continue;
        }
        let Some(separator) = find_top_level(declaration, ':')? else {
            return Err(GeneratedSvgError::Unsafe(
                "generated SVG contains invalid CSS".to_owned(),
            ));
        };
        let property = declaration[..separator].trim().to_ascii_lowercase();
        if !is_safe_css_property(&property) {
            continue;
        }
        let value =
            rewrite_fragment_urls(declaration[separator + 1..].trim(), id_map, https_hosts)?;
        if value.is_empty() {
            continue;
        }
        append_declaration(&mut output, &format!("{property}:{value}"));
    }
    Ok(output)
}

fn sanitize_stylesheet(
    css: &str,
    root_id: &str,
    id_map: &HashMap<String, String>,
    https_hosts: &[String],
) -> Result<String, GeneratedSvgError> {
    validate_css_tokens(css)?;
    let mut output = String::new();
    let mut cursor = 0usize;
    while cursor < css.len() {
        cursor = skip_css_space_and_comments(css, cursor)?;
        if cursor >= css.len() {
            break;
        }
        let Some(open_offset) = find_top_level_from(css, cursor, '{')? else {
            return Err(GeneratedSvgError::Unsafe(
                "generated SVG contains invalid stylesheet CSS".to_owned(),
            ));
        };
        let selector = css[cursor..open_offset].trim();
        let close_offset = find_matching_brace(css, open_offset)?;
        let body = &css[open_offset + 1..close_offset];
        cursor = close_offset + 1;
        if selector.starts_with('@') {
            continue;
        }
        let declarations = sanitize_declarations(body, id_map, https_hosts)?;
        if declarations.is_empty() {
            continue;
        }
        let selectors = split_top_level(selector, ',')?
            .into_iter()
            .filter_map(|item| {
                let rewritten = rewrite_selector_ids(item.trim(), id_map);
                scope_stylesheet_selector(&rewritten, root_id)
            })
            .collect::<Vec<_>>();
        if selectors.is_empty() {
            continue;
        }
        output.push_str(&selectors.join(","));
        output.push('{');
        output.push_str(&declarations);
        output.push('}');
    }
    Ok(output)
}

fn scope_stylesheet_selector(selector: &str, root_id: &str) -> Option<String> {
    if selector.is_empty() {
        return None;
    }
    let root_selector = format!("#{root_id}");
    let Some(remainder) = selector.strip_prefix(&root_selector) else {
        return Some(format!("{root_selector} {selector}"));
    };
    if selector_escapes_root_with_sibling(remainder)? {
        return None;
    }
    Some(selector.to_owned())
}

fn selector_escapes_root_with_sibling(selector: &str) -> Option<bool> {
    if selector.contains("/*") {
        return Some(true);
    }
    let mut quote = None;
    let mut depth = 0usize;
    let mut characters = selector.char_indices().peekable();
    while let Some((_offset, character)) = characters.next() {
        if let Some(active_quote) = quote {
            if character == '\\' {
                characters.next();
            } else if character == active_quote {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' => quote = Some(character),
            '(' | '[' => depth += 1,
            ')' | ']' => depth = depth.checked_sub(1)?,
            '+' | '~' | '|' if depth == 0 => return Some(true),
            '>' if depth == 0 => return Some(false),
            value if depth == 0 && value.is_whitespace() => {
                while characters
                    .peek()
                    .is_some_and(|(_, value)| value.is_whitespace())
                {
                    characters.next();
                }
                return Some(matches!(characters.peek(), Some((_, '+' | '~' | '|'))));
            }
            _ => {}
        }
    }
    (quote.is_none() && depth == 0).then_some(false)
}

fn validate_css_tokens(css: &str) -> Result<(), GeneratedSvgError> {
    let lowered = css.to_ascii_lowercase();
    if css.contains('\\')
        || lowered.contains("image-set(")
        || lowered.contains("-webkit-image-set(")
        || lowered.contains("element(")
    {
        return Err(GeneratedSvgError::Unsafe(
            "generated SVG contains unsupported CSS resource syntax".to_owned(),
        ));
    }
    let mut input = ParserInput::new(css);
    let mut parser = Parser::new(&mut input);
    while !parser.is_exhausted() {
        let token = parser
            .next_including_whitespace_and_comments()
            .map_err(|error| {
                GeneratedSvgError::Unsafe(format!("invalid generated SVG CSS: {error:?}"))
            })?;
        if matches!(token, Token::BadString(_) | Token::BadUrl(_)) {
            return Err(GeneratedSvgError::Unsafe(
                "generated SVG contains malformed CSS".to_owned(),
            ));
        }
    }
    Ok(())
}

fn rewrite_fragment_urls(
    value: &str,
    id_map: &HashMap<String, String>,
    https_hosts: &[String],
) -> Result<String, GeneratedSvgError> {
    let mut output = String::with_capacity(value.len());
    let mut cursor = 0usize;
    while cursor < value.len() {
        let Some(relative) = value[cursor..].to_ascii_lowercase().find("url(") else {
            output.push_str(&value[cursor..]);
            break;
        };
        let start = cursor + relative;
        output.push_str(&value[cursor..start]);
        let content_start = start + 4;
        let close = find_css_function_end(value, content_start)?;
        let raw_url = value[content_start..close]
            .trim()
            .trim_matches(|character| matches!(character, '\'' | '"'));
        let rewritten_url = if let Some(fragment) = raw_url.strip_prefix('#') {
            format!(
                "#{}",
                id_map
                    .get(fragment)
                    .ok_or_else(|| GeneratedSvgError::Unsafe(
                        "generated SVG CSS references an unknown id".to_owned()
                    ))?
            )
        } else if is_allowed_resource_url(raw_url, https_hosts) {
            raw_url.to_owned()
        } else {
            return Err(GeneratedSvgError::Unsafe(
                "generated SVG CSS contains a blocked URL".to_owned(),
            ));
        };
        output.push_str("url(");
        output.push_str(&rewritten_url);
        output.push(')');
        cursor = close + 1;
    }
    let lowered = output.to_ascii_lowercase();
    if lowered.contains("javascript:")
        || lowered.contains("vbscript:")
        || lowered.contains("expression(")
        || lowered.contains("@import")
        || lowered.contains("-moz-binding")
    {
        return Err(GeneratedSvgError::Unsafe(
            "generated SVG contains unsafe CSS".to_owned(),
        ));
    }
    Ok(output)
}

fn rewrite_selector_ids(selector: &str, id_map: &HashMap<String, String>) -> String {
    let mut output = String::with_capacity(selector.len());
    let mut cursor = 0usize;
    while cursor < selector.len() {
        let character = selector[cursor..].chars().next().expect("selector cursor");
        if character != '#' {
            output.push(character);
            cursor += character.len_utf8();
            continue;
        }
        let id_start = cursor + 1;
        let mut id_end = id_start;
        for (offset, id_character) in selector[id_start..].char_indices() {
            if !(id_character.is_ascii_alphanumeric()
                || matches!(id_character, '-' | '_' | ':' | '.'))
            {
                break;
            }
            id_end = id_start + offset + id_character.len_utf8();
        }
        if id_end == id_start {
            output.push('#');
            cursor += 1;
            continue;
        }
        let id = &selector[id_start..id_end];
        output.push('#');
        output.push_str(id_map.get(id).map(String::as_str).unwrap_or(id));
        cursor = id_end;
    }
    output
}

fn is_unsafe_element(name: &[u8]) -> bool {
    matches!(
        name,
        b"script"
            | b"iframe"
            | b"object"
            | b"embed"
            | b"audio"
            | b"video"
            | b"canvas"
            | b"form"
            | b"input"
            | b"button"
            | b"textarea"
            | b"select"
            | b"animate"
            | b"animatemotion"
            | b"animatetransform"
            | b"discard"
            | b"handler"
            | b"listener"
            | b"set"
    )
}

fn is_safe_foreign_element(name: &[u8]) -> bool {
    matches!(
        name,
        b"div" | b"span" | b"p" | b"br" | b"strong" | b"em" | b"b" | b"i" | b"small"
    )
}

fn is_forbidden_attribute(name: &str) -> bool {
    matches!(
        name,
        "srcdoc"
            | "nonce"
            | "integrity"
            | "crossorigin"
            | "formaction"
            | "autofocus"
            | "ping"
            | "base"
    )
}

fn is_safe_css_property(property: &str) -> bool {
    !property.is_empty()
        && property
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        && !matches!(
            property,
            "animation" | "animation-name" | "behavior" | "cursor" | "filter" | "transition"
        )
}

fn is_safe_navigation_url(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:")
}

fn is_allowed_resource_url(value: &str, https_hosts: &[String]) -> bool {
    if is_safe_raster_data_url(value) {
        return true;
    }
    let Some(authority) = https_authority(value) else {
        return false;
    };
    https_hosts
        .iter()
        .any(|host| host.eq_ignore_ascii_case(authority))
}

fn is_safe_raster_data_url(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        "data:image/png;base64,",
        "data:image/jpeg;base64,",
        "data:image/gif;base64,",
        "data:image/webp;base64,",
    ]
    .iter()
    .any(|prefix| lower.starts_with(prefix))
}

fn https_authority(value: &str) -> Option<&str> {
    if !value
        .get(..8)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("https://"))
    {
        return None;
    }
    let rest = &value[8..];
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..end];
    if authority.is_empty() || authority.contains('@') || authority.chars().any(char::is_whitespace)
    {
        return None;
    }
    Some(authority.strip_suffix(":443").unwrap_or(authority))
}

fn preserve_aspect_ratio(position: Option<&str>) -> Option<&'static str> {
    match position?
        .trim()
        .to_ascii_lowercase()
        .replace('_', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .as_str()
    {
        "center" | "center center" => Some("xMidYMid meet"),
        "top" | "top center" | "center top" => Some("xMidYMin meet"),
        "bottom" | "bottom center" | "center bottom" => Some("xMidYMax meet"),
        "left" | "left center" | "center left" => Some("xMinYMid meet"),
        "right" | "right center" | "center right" => Some("xMaxYMid meet"),
        "top left" | "left top" => Some("xMinYMin meet"),
        "top right" | "right top" => Some("xMaxYMin meet"),
        "bottom left" | "left bottom" => Some("xMinYMax meet"),
        "bottom right" | "right bottom" => Some("xMaxYMax meet"),
        _ => None,
    }
}

fn append_declaration(output: &mut String, declaration: &str) {
    if !output.is_empty() && !output.ends_with(';') {
        output.push(';');
    }
    output.push_str(declaration);
    if !output.ends_with(';') {
        output.push(';');
    }
}

fn local_name(name: &[u8]) -> &[u8] {
    let local = name.rsplit(|byte| *byte == b':').next().unwrap_or(name);
    // SVG/XML names used by renderers are ASCII. This allocation-free conversion is handled by callers.
    local
}

fn split_top_level(value: &str, separator: char) -> Result<Vec<&str>, GeneratedSvgError> {
    let mut parts = Vec::new();
    let mut start = 0usize;
    let mut quote = None;
    let mut parentheses = 0usize;
    let mut comment = false;
    let chars = value.char_indices().collect::<Vec<_>>();
    let mut index = 0usize;
    while index < chars.len() {
        let (offset, character) = chars[index];
        let next = chars.get(index + 1).map(|(_, value)| *value);
        if comment {
            if character == '*' && next == Some('/') {
                comment = false;
                index += 2;
                continue;
            }
            index += 1;
            continue;
        }
        if quote.is_none() && character == '/' && next == Some('*') {
            comment = true;
            index += 2;
            continue;
        }
        if let Some(active_quote) = quote {
            if character == '\\' {
                index += 2;
                continue;
            }
            if character == active_quote {
                quote = None;
            }
        } else {
            match character {
                '\'' | '"' => quote = Some(character),
                '(' | '[' => parentheses += 1,
                ')' | ']' => parentheses = parentheses.saturating_sub(1),
                _ if character == separator && parentheses == 0 => {
                    parts.push(&value[start..offset]);
                    start = offset + character.len_utf8();
                }
                _ => {}
            }
        }
        index += 1;
    }
    if quote.is_some() || parentheses != 0 || comment {
        return Err(GeneratedSvgError::Unsafe(
            "generated SVG contains malformed CSS".to_owned(),
        ));
    }
    parts.push(&value[start..]);
    Ok(parts)
}

fn find_top_level(value: &str, target: char) -> Result<Option<usize>, GeneratedSvgError> {
    find_top_level_from(value, 0, target)
}

fn find_top_level_from(
    value: &str,
    start: usize,
    target: char,
) -> Result<Option<usize>, GeneratedSvgError> {
    for part in split_top_level(&value[start..], target)? {
        if part.len() < value[start..].len() {
            return Ok(Some(start + part.len()));
        }
    }
    Ok(None)
}

fn find_matching_brace(value: &str, open: usize) -> Result<usize, GeneratedSvgError> {
    let mut quote = None;
    let mut depth = 0usize;
    for (relative, character) in value[open..].char_indices() {
        if let Some(active_quote) = quote {
            if character == active_quote {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' => quote = Some(character),
            '{' => depth += 1,
            '}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Ok(open + relative);
                }
            }
            _ => {}
        }
    }
    Err(GeneratedSvgError::Unsafe(
        "generated SVG contains an unclosed CSS block".to_owned(),
    ))
}

fn find_css_function_end(value: &str, start: usize) -> Result<usize, GeneratedSvgError> {
    let mut quote = None;
    for (relative, character) in value[start..].char_indices() {
        if let Some(active_quote) = quote {
            if character == active_quote {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' => quote = Some(character),
            ')' => return Ok(start + relative),
            _ => {}
        }
    }
    Err(GeneratedSvgError::Unsafe(
        "generated SVG contains an unclosed CSS URL".to_owned(),
    ))
}

fn skip_css_space_and_comments(value: &str, mut cursor: usize) -> Result<usize, GeneratedSvgError> {
    loop {
        while cursor < value.len() {
            let character = value[cursor..].chars().next().expect("css cursor");
            if !character.is_whitespace() {
                break;
            }
            cursor += character.len_utf8();
        }
        if value[cursor..].starts_with("/*") {
            let Some(end) = value[cursor + 2..].find("*/") else {
                return Err(GeneratedSvgError::Unsafe(
                    "generated SVG contains an unclosed CSS comment".to_owned(),
                ));
            };
            cursor += end + 4;
            continue;
        }
        return Ok(cursor);
    }
}

#[cfg(test)]
mod tests {
    use super::{finalize_generated_svg, GeneratedSvgError, GeneratedSvgPresentation};

    #[test]
    fn namespaces_ids_scopes_css_and_applies_presentation_last() {
        let svg = r##"<svg id="diagram" viewBox="0 0 10 10" style="width:10px"><style>#diagram .node{fill:url(#paint)}</style><defs><linearGradient id="paint"/></defs><rect id="node" class="node" aria-labelledby="node" style="opacity:.5"/></svg>"##;
        let finalized = finalize_generated_svg(
            svg,
            "revision-1-block-2",
            &GeneratedSvgPresentation {
                root_style: Some(
                    "width:200px;transform:rotate(10deg);border-radius:4px;".to_owned(),
                ),
                position: Some("top right".to_owned()),
            },
            &[],
        )
        .expect("finalization failed");

        assert!(finalized.contains("id=\"kmark-svg-revision-1-block-2\""));
        assert!(finalized.contains("url(#kmark-revision-1-block-2-id-1)"));
        assert!(finalized.contains("#kmark-svg-revision-1-block-2 .node"));
        assert!(finalized.contains("width:10px;width:200px"));
        assert!(finalized.contains("transform-box:border-box"));
        assert!(finalized.contains("overflow:hidden"));
        assert!(finalized.contains("preserveAspectRatio=\"xMaxYMin meet\""));
    }

    #[test]
    fn prevents_stylesheet_selectors_from_escaping_the_generated_svg_root() {
        let finalized = finalize_generated_svg(
            r##"<svg id="diagram" class="root"><style>#diagram + body{display:none}#diagram[class~='root'] .node{fill:blue}.node{fill:red}</style><rect class="node"/></svg>"##,
            "scope",
            &GeneratedSvgPresentation::default(),
            &[],
        )
        .expect("finalization failed");

        assert!(!finalized.contains("+ body"));
        assert!(
            finalized.contains("[class~=&apos;root&apos;] .node{fill:blue;}"),
            "unexpected scoped SVG: {finalized}"
        );
        assert!(finalized.contains("#kmark-svg-scope .node{fill:red;}"));
    }

    #[test]
    fn strips_active_content_and_event_handlers() {
        let finalized = finalize_generated_svg(
            r#"<svg xmlns="http://www.w3.org/2000/svg" xml:base="https://evil.test/" onclick="alert(1)"><script>alert(1)</script><discard begin="1s"/><handler>run()</handler><a href="https://example.test" ping="https://evil.test/ping"><rect onload="x"/></a></svg>"#,
            "safe",
            &GeneratedSvgPresentation::default(),
            &[],
        )
        .expect("finalization failed");
        assert!(!finalized.contains("script"));
        assert!(!finalized.contains("onclick"));
        assert!(!finalized.contains("onload"));
        assert!(!finalized.contains("discard"));
        assert!(!finalized.contains("handler"));
        assert!(!finalized.contains("xml:base"));
        assert!(!finalized.contains("ping="));
    }

    #[test]
    fn enforces_resource_host_allowlist_and_rejects_data_svg() {
        let allowed = finalize_generated_svg(
            r#"<svg><image href="https://cdn.example.test:443/a.png"/></svg>"#,
            "allowed",
            &GeneratedSvgPresentation::default(),
            &["cdn.example.test".to_owned()],
        );
        assert!(allowed.is_ok());
        assert!(matches!(
            finalize_generated_svg(
                r#"<svg><image href="data:image/svg+xml;base64,PHN2Zz4="/></svg>"#,
                "blocked",
                &GeneratedSvgPresentation::default(),
                &[],
            ),
            Err(GeneratedSvgError::Unsafe(_))
        ));
        assert!(matches!(
            finalize_generated_svg(
                r#"<svg><image src="https://evil.test/a.png"/></svg>"#,
                "blocked-src",
                &GeneratedSvgPresentation::default(),
                &[],
            ),
            Err(GeneratedSvgError::Unsafe(_))
        ));
        assert!(matches!(
            finalize_generated_svg(
                r#"<svg><rect style="background:u\72l(https://evil.test/x.png)"/></svg>"#,
                "escaped-css-url",
                &GeneratedSvgPresentation::default(),
                &[],
            ),
            Err(GeneratedSvgError::Unsafe(_))
        ));
        assert!(matches!(
            finalize_generated_svg(
                r#"<svg><rect style="background-image:image-set('https://evil.test/x.png' 1x)"/></svg>"#,
                "image-set",
                &GeneratedSvgPresentation::default(),
                &[],
            ),
            Err(GeneratedSvgError::Unsafe(_))
        ));
    }

    #[test]
    fn rejects_multiple_roots_and_doctype() {
        assert!(matches!(
            finalize_generated_svg(
                "<svg/><svg/>",
                "multiple",
                &GeneratedSvgPresentation::default(),
                &[],
            ),
            Err(GeneratedSvgError::InvalidXml(_))
        ));
        assert!(matches!(
            finalize_generated_svg(
                "<!DOCTYPE svg><svg/>",
                "doctype",
                &GeneratedSvgPresentation::default(),
                &[],
            ),
            Err(GeneratedSvgError::Unsafe(_))
        ));
    }

    #[test]
    fn preserves_xml_text_entities_without_double_escaping() {
        let finalized = finalize_generated_svg(
            "<svg><text>A &amp; B &#x2713;</text></svg>",
            "entities",
            &GeneratedSvgPresentation::default(),
            &[],
        )
        .expect("finalization failed");
        assert!(
            finalized.contains("<text>A &amp; B ✓</text>"),
            "unexpected finalized SVG: {finalized}"
        );
        assert!(!finalized.contains("&amp;amp;"));

        assert!(matches!(
            finalize_generated_svg(
                "<svg><text>&custom;</text></svg>",
                "unknown-entity",
                &GeneratedSvgPresentation::default(),
                &[],
            ),
            Err(GeneratedSvgError::InvalidXml(_))
        ));
    }
}
