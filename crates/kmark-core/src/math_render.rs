#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MarkdownMathDisplay {
    Inline,
    Block,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum MathNode {
    Fraction {
        denominator: Box<MathNode>,
        numerator: Box<MathNode>,
    },
    Fenced {
        body: Box<MathNode>,
        close: String,
        open: String,
    },
    Identifier(String),
    Matrix(Vec<Vec<MathNode>>),
    Number(String),
    Operator(String),
    Row(Vec<MathNode>),
    Space,
    Sqrt {
        body: Box<MathNode>,
        degree: Option<Box<MathNode>>,
    },
    SupSub {
        base: Box<MathNode>,
        subscript: Option<Box<MathNode>>,
        superscript: Option<Box<MathNode>>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MathParseError {
    message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MathStopKind {
    BracketEnd,
    End,
    GroupEnd,
    MatrixCell,
    MatrixEnd,
    MatrixRow,
    RightDelimiter,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct MathStopSet {
    bracket_end: bool,
    group_end: bool,
    matrix_cell: bool,
    matrix_end: bool,
    matrix_row: bool,
    right_delimiter: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum MathCommand {
    LineBreak,
    Symbol(char),
    Word(String),
}

#[derive(Clone)]
struct MathParser<'a> {
    cursor: usize,
    input: &'a str,
}

pub(crate) fn render_math_html(source: &str, display: MarkdownMathDisplay) -> String {
    let class_name = match display {
        MarkdownMathDisplay::Inline => "math-inline",
        MarkdownMathDisplay::Block => "math-display",
    };

    match render_mathml(source, display) {
        Ok(mathml) => {
            let source_label = escape_html_attribute(&format!("数式: {}", source.trim()));
            format!(
                "<span class=\"math {class_name}\" aria-label=\"{source_label}\">{mathml}</span>"
            )
        }
        Err(error) => render_math_error_html(source, display, &error.message),
    }
}

fn render_mathml(source: &str, display: MarkdownMathDisplay) -> Result<String, MathParseError> {
    let source = source.trim();

    if source.is_empty() {
        return Err(MathParseError::new("empty math expression"));
    }

    let body = match display {
        MarkdownMathDisplay::Inline => render_math_source(source)?,
        MarkdownMathDisplay::Block => render_display_math_source(source)?,
    };
    let display_value = match display {
        MarkdownMathDisplay::Inline => "inline",
        MarkdownMathDisplay::Block => "block",
    };

    Ok(format!(
        "<math xmlns=\"http://www.w3.org/1998/Math/MathML\" display=\"{display_value}\">{body}</math>"
    ))
}

fn render_display_math_source(source: &str) -> Result<String, MathParseError> {
    let lines = source
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();

    if lines.len() > 1 && !source.contains("\\begin{matrix}") {
        let mut html = String::from("<mtable displaystyle=\"true\">");

        for line in lines {
            html.push_str("<mtr><mtd>");
            html.push_str(&render_math_source(line)?);
            html.push_str("</mtd></mtr>");
        }

        html.push_str("</mtable>");
        return Ok(html);
    }

    render_math_source(source)
}

fn render_math_source(source: &str) -> Result<String, MathParseError> {
    let node = MathParser::new(source).parse_document()?;

    Ok(render_math_node(&node))
}

fn render_math_error_html(source: &str, display: MarkdownMathDisplay, message: &str) -> String {
    let class_name = match display {
        MarkdownMathDisplay::Inline => "math-inline",
        MarkdownMathDisplay::Block => "math-display",
    };
    let escaped_message = escape_html(message);
    let escaped_source = escape_html(source.trim());
    let title = escape_html_attribute(&format!("Math error: {message}"));

    format!(
        "<span class=\"math {class_name} math-error\" title=\"{title}\"><span class=\"math-error__label\">Math error</span><code class=\"math-error__source\">{escaped_source}</code><span class=\"math-error__message\">{escaped_message}</span></span>"
    )
}

fn render_math_node(node: &MathNode) -> String {
    match node {
        MathNode::Fraction {
            denominator,
            numerator,
        } => format!(
            "<mfrac>{}{}</mfrac>",
            render_grouped_math_node(numerator),
            render_grouped_math_node(denominator),
        ),
        MathNode::Fenced { body, close, open } => {
            let mut html = String::from("<mrow>");

            if !open.is_empty() {
                html.push_str(&format!("<mo fence=\"true\">{}</mo>", escape_html(open)));
            }

            html.push_str(&render_math_node(body));

            if !close.is_empty() {
                html.push_str(&format!("<mo fence=\"true\">{}</mo>", escape_html(close)));
            }

            html.push_str("</mrow>");
            html
        }
        MathNode::Identifier(value) => format!("<mi>{}</mi>", escape_html(value)),
        MathNode::Matrix(rows) => {
            let mut html = String::from("<mtable>");

            for row in rows {
                html.push_str("<mtr>");

                for cell in row {
                    html.push_str("<mtd>");
                    html.push_str(&render_grouped_math_node(cell));
                    html.push_str("</mtd>");
                }

                html.push_str("</mtr>");
            }

            html.push_str("</mtable>");
            html
        }
        MathNode::Number(value) => format!("<mn>{}</mn>", escape_html(value)),
        MathNode::Operator(value) => format!("<mo>{}</mo>", escape_html(value)),
        MathNode::Row(nodes) => {
            let mut html = String::from("<mrow>");

            for child in nodes {
                html.push_str(&render_math_node(child));
            }

            html.push_str("</mrow>");
            html
        }
        MathNode::Space => "<mspace width=\"0.25em\" />".to_owned(),
        MathNode::Sqrt { body, degree } => match degree {
            Some(degree) => format!(
                "<mroot>{}{}</mroot>",
                render_grouped_math_node(body),
                render_grouped_math_node(degree),
            ),
            None => format!("<msqrt>{}</msqrt>", render_math_node(body)),
        },
        MathNode::SupSub {
            base,
            subscript,
            superscript,
        } => match (subscript, superscript) {
            (Some(subscript), Some(superscript)) => format!(
                "<msubsup>{}{}{}</msubsup>",
                render_grouped_math_node(base),
                render_grouped_math_node(subscript),
                render_grouped_math_node(superscript),
            ),
            (Some(subscript), None) => format!(
                "<msub>{}{}</msub>",
                render_grouped_math_node(base),
                render_grouped_math_node(subscript),
            ),
            (None, Some(superscript)) => format!(
                "<msup>{}{}</msup>",
                render_grouped_math_node(base),
                render_grouped_math_node(superscript),
            ),
            (None, None) => render_math_node(base),
        },
    }
}

fn render_grouped_math_node(node: &MathNode) -> String {
    match node {
        MathNode::Identifier(_)
        | MathNode::Matrix(_)
        | MathNode::Number(_)
        | MathNode::Operator(_)
        | MathNode::Space => render_math_node(node),
        _ => format!("<mrow>{}</mrow>", render_math_node(node)),
    }
}

impl MathParseError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl MathNode {
    fn row(nodes: Vec<MathNode>) -> Self {
        match nodes.as_slice() {
            [single] => single.clone(),
            _ => Self::Row(nodes),
        }
    }

    fn is_empty(&self) -> bool {
        matches!(self, Self::Row(nodes) if nodes.is_empty())
    }
}

impl<'a> MathParser<'a> {
    fn new(input: &'a str) -> Self {
        Self { cursor: 0, input }
    }

    fn parse_document(mut self) -> Result<MathNode, MathParseError> {
        let (node, stop) = self.parse_sequence(MathStopSet::default())?;

        match stop {
            MathStopKind::End => {
                if node.is_empty() {
                    Err(MathParseError::new("empty math expression"))
                } else {
                    Ok(node)
                }
            }
            _ => Err(MathParseError::new("unexpected math delimiter")),
        }
    }

    fn parse_sequence(
        &mut self,
        stop_set: MathStopSet,
    ) -> Result<(MathNode, MathStopKind), MathParseError> {
        let mut nodes = Vec::new();

        loop {
            self.skip_whitespace();

            if let Some(stop) = self.peek_stop_kind(stop_set) {
                return Ok((MathNode::row(nodes), stop));
            }

            if matches!(self.peek_char(), Some('^' | '_')) {
                return Err(MathParseError::new("script marker has no base"));
            }

            let atom = self.parse_atom()?;
            nodes.push(self.parse_scripts(atom)?);
        }
    }

    fn parse_atom(&mut self) -> Result<MathNode, MathParseError> {
        self.skip_whitespace();

        let Some(character) = self.peek_char() else {
            return Err(MathParseError::new("unexpected end of math expression"));
        };

        if character == '{' {
            return self.parse_required_group("group");
        }

        if character == '\\' {
            return self.parse_command_atom();
        }

        if self.is_number_start() {
            return Ok(MathNode::Number(self.read_number()));
        }

        if is_identifier_character(character) {
            self.advance_char();
            return Ok(MathNode::Identifier(character.to_string()));
        }

        if let Some(operator) = math_operator_for_character(character) {
            self.advance_char();
            return Ok(MathNode::Operator(operator.to_owned()));
        }

        Err(MathParseError::new(format!(
            "unsupported math character `{character}`"
        )))
    }

    fn parse_command_atom(&mut self) -> Result<MathNode, MathParseError> {
        match self.read_command()? {
            MathCommand::LineBreak => Ok(MathNode::Space),
            MathCommand::Symbol(character) => self.parse_symbol_command_atom(character),
            MathCommand::Word(command) => match command.as_str() {
                "begin" => self.parse_begin_environment(),
                "end" => Err(MathParseError::new("unexpected \\end")),
                "frac" => {
                    let numerator = self.parse_required_group("\\frac numerator")?;
                    let denominator = self.parse_required_group("\\frac denominator")?;

                    Ok(MathNode::Fraction {
                        denominator: Box::new(denominator),
                        numerator: Box::new(numerator),
                    })
                }
                "left" => self.parse_left_right_group(),
                "right" => Err(MathParseError::new("unexpected \\right")),
                "sqrt" => {
                    let degree = self.parse_optional_bracket_group()?;
                    let body = self.parse_required_group("\\sqrt radicand")?;

                    Ok(MathNode::Sqrt {
                        body: Box::new(body),
                        degree: degree.map(Box::new),
                    })
                }
                "quad" => Ok(MathNode::Space),
                "qquad" => Ok(MathNode::Row(vec![MathNode::Space, MathNode::Space])),
                _ => {
                    if let Some(symbol) = greek_command_symbol(&command) {
                        return Ok(MathNode::Identifier(symbol.to_owned()));
                    }

                    if let Some(symbol) = operator_command_symbol(&command) {
                        return Ok(MathNode::Operator(symbol.to_owned()));
                    }

                    if let Some(identifier) = function_command_identifier(&command) {
                        return Ok(MathNode::Identifier(identifier.to_owned()));
                    }

                    Err(MathParseError::new(format!(
                        "unsupported math command `\\{command}`"
                    )))
                }
            },
        }
    }

    fn parse_symbol_command_atom(&self, character: char) -> Result<MathNode, MathParseError> {
        match character {
            ' ' | ',' | ':' | ';' | '!' => Ok(MathNode::Space),
            '{' | '}' | '$' | '%' | '#' | '&' | '_' | '^' | '\\' => {
                Ok(MathNode::Operator(character.to_string()))
            }
            _ => {
                if let Some(operator) = math_operator_for_character(character) {
                    return Ok(MathNode::Operator(operator.to_owned()));
                }

                Err(MathParseError::new(format!(
                    "unsupported escaped math character `\\{character}`"
                )))
            }
        }
    }

    fn parse_scripts(&mut self, base: MathNode) -> Result<MathNode, MathParseError> {
        let mut subscript = None;
        let mut superscript = None;

        loop {
            self.skip_whitespace();

            match self.peek_char() {
                Some('_') => {
                    if subscript.is_some() {
                        return Err(MathParseError::new("duplicate subscript"));
                    }

                    self.advance_char();
                    subscript = Some(Box::new(self.parse_script_argument()?));
                }
                Some('^') => {
                    if superscript.is_some() {
                        return Err(MathParseError::new("duplicate superscript"));
                    }

                    self.advance_char();
                    superscript = Some(Box::new(self.parse_script_argument()?));
                }
                _ => break,
            }
        }

        if subscript.is_none() && superscript.is_none() {
            return Ok(base);
        }

        Ok(MathNode::SupSub {
            base: Box::new(base),
            subscript,
            superscript,
        })
    }

    fn parse_script_argument(&mut self) -> Result<MathNode, MathParseError> {
        self.skip_whitespace();

        if self.peek_char() == Some('{') {
            return self.parse_required_group("script argument");
        }

        self.parse_atom()
    }

    fn parse_required_group(&mut self, context: &str) -> Result<MathNode, MathParseError> {
        self.skip_whitespace();

        if self.peek_char() != Some('{') {
            return Err(MathParseError::new(format!("{context} requires `{{...}}`")));
        }

        self.advance_char();

        let (node, stop) = self.parse_sequence(MathStopSet {
            group_end: true,
            ..MathStopSet::default()
        })?;

        if stop != MathStopKind::GroupEnd {
            return Err(MathParseError::new(format!(
                "{context} missing closing `}}`"
            )));
        }

        self.advance_char();

        if node.is_empty() {
            return Err(MathParseError::new(format!("{context} is empty")));
        }

        Ok(node)
    }

    fn parse_optional_bracket_group(&mut self) -> Result<Option<MathNode>, MathParseError> {
        self.skip_whitespace();

        if self.peek_char() != Some('[') {
            return Ok(None);
        }

        self.advance_char();

        let (node, stop) = self.parse_sequence(MathStopSet {
            bracket_end: true,
            ..MathStopSet::default()
        })?;

        if stop != MathStopKind::BracketEnd {
            return Err(MathParseError::new(
                "optional root degree missing closing `]`",
            ));
        }

        self.advance_char();

        if node.is_empty() {
            return Err(MathParseError::new("optional root degree is empty"));
        }

        Ok(Some(node))
    }

    fn parse_left_right_group(&mut self) -> Result<MathNode, MathParseError> {
        let open = self.read_delimiter()?;
        let (body, stop) = self.parse_sequence(MathStopSet {
            right_delimiter: true,
            ..MathStopSet::default()
        })?;

        if stop != MathStopKind::RightDelimiter {
            return Err(MathParseError::new("\\left missing matching \\right"));
        }

        match self.read_command()? {
            MathCommand::Word(command) if command == "right" => {}
            _ => return Err(MathParseError::new("\\left missing matching \\right")),
        }

        let close = self.read_delimiter()?;

        Ok(MathNode::Fenced {
            body: Box::new(body),
            close,
            open,
        })
    }

    fn parse_begin_environment(&mut self) -> Result<MathNode, MathParseError> {
        let environment = self.read_environment_name()?;

        match environment.as_str() {
            "matrix" => self.parse_matrix_environment(),
            _ => Err(MathParseError::new(format!(
                "unsupported math environment `{environment}`"
            ))),
        }
    }

    fn parse_matrix_environment(&mut self) -> Result<MathNode, MathParseError> {
        let mut rows = Vec::new();
        let mut current_row = Vec::new();

        loop {
            let (cell, stop) = self.parse_sequence(MathStopSet {
                matrix_cell: true,
                matrix_end: true,
                matrix_row: true,
                ..MathStopSet::default()
            })?;

            current_row.push(cell);

            match stop {
                MathStopKind::MatrixCell => {
                    self.advance_char();
                }
                MathStopKind::MatrixRow => {
                    self.read_command()?;
                    rows.push(current_row);
                    current_row = Vec::new();
                }
                MathStopKind::MatrixEnd => {
                    self.consume_end_environment("matrix")?;
                    rows.push(current_row);
                    break;
                }
                MathStopKind::End => {
                    return Err(MathParseError::new("matrix missing \\end{matrix}"));
                }
                _ => return Err(MathParseError::new("invalid matrix delimiter")),
            }
        }

        if rows.is_empty() {
            return Err(MathParseError::new("matrix is empty"));
        }

        Ok(MathNode::Matrix(rows))
    }

    fn consume_end_environment(&mut self, expected: &str) -> Result<(), MathParseError> {
        match self.read_command()? {
            MathCommand::Word(command) if command == "end" => {}
            _ => return Err(MathParseError::new(format!("missing \\end{{{expected}}}"))),
        }

        let environment = self.read_environment_name()?;

        if environment != expected {
            return Err(MathParseError::new(format!(
                "expected \\end{{{expected}}}, found \\end{{{environment}}}"
            )));
        }

        Ok(())
    }

    fn read_delimiter(&mut self) -> Result<String, MathParseError> {
        self.skip_whitespace();

        if self.peek_char() == Some('\\') {
            return match self.read_command()? {
                MathCommand::Symbol(character) => delimiter_for_character(character),
                MathCommand::Word(command) => delimiter_for_command(&command)
                    .map(str::to_owned)
                    .ok_or_else(|| {
                        MathParseError::new(format!("unsupported delimiter `\\{command}`"))
                    }),
                MathCommand::LineBreak => {
                    Err(MathParseError::new("line break cannot be delimiter"))
                }
            };
        }

        let Some(character) = self.advance_char() else {
            return Err(MathParseError::new("missing delimiter"));
        };

        delimiter_for_character(character)
    }

    fn read_environment_name(&mut self) -> Result<String, MathParseError> {
        self.skip_whitespace();

        if self.peek_char() != Some('{') {
            return Err(MathParseError::new("environment name requires `{...}`"));
        }

        self.advance_char();
        let start = self.cursor;

        while matches!(self.peek_char(), Some(character) if character.is_ascii_alphanumeric() || character == '*')
        {
            self.advance_char();
        }

        let name = self.input[start..self.cursor].to_owned();

        if name.is_empty() {
            return Err(MathParseError::new("environment name is empty"));
        }

        if self.peek_char() != Some('}') {
            return Err(MathParseError::new("environment name missing closing `}`"));
        }

        self.advance_char();
        Ok(name)
    }

    fn peek_stop_kind(&self, stop_set: MathStopSet) -> Option<MathStopKind> {
        if self.is_eof() {
            return Some(MathStopKind::End);
        }

        match self.peek_char() {
            Some('}') if stop_set.group_end => return Some(MathStopKind::GroupEnd),
            Some(']') if stop_set.bracket_end => return Some(MathStopKind::BracketEnd),
            Some('&') if stop_set.matrix_cell => return Some(MathStopKind::MatrixCell),
            Some('\\') => {
                if stop_set.matrix_row && self.peek_command() == Some(MathCommand::LineBreak) {
                    return Some(MathStopKind::MatrixRow);
                }

                if stop_set.right_delimiter
                    && self.peek_command() == Some(MathCommand::Word("right".to_owned()))
                {
                    return Some(MathStopKind::RightDelimiter);
                }

                if stop_set.matrix_end
                    && self.peek_end_environment_name().as_deref() == Some("matrix")
                {
                    return Some(MathStopKind::MatrixEnd);
                }
            }
            _ => {}
        }

        None
    }

    fn peek_command(&self) -> Option<MathCommand> {
        let mut parser = self.clone();

        parser.read_command().ok()
    }

    fn peek_end_environment_name(&self) -> Option<String> {
        let mut parser = self.clone();

        match parser.read_command().ok()? {
            MathCommand::Word(command) if command == "end" => parser.read_environment_name().ok(),
            _ => None,
        }
    }

    fn read_command(&mut self) -> Result<MathCommand, MathParseError> {
        if self.peek_char() != Some('\\') {
            return Err(MathParseError::new("expected command"));
        }

        self.advance_char();

        let Some(character) = self.peek_char() else {
            return Err(MathParseError::new("dangling escape"));
        };

        if character == '\\' {
            self.advance_char();
            return Ok(MathCommand::LineBreak);
        }

        if character.is_ascii_alphabetic() {
            let start = self.cursor;

            while matches!(self.peek_char(), Some(next) if next.is_ascii_alphabetic()) {
                self.advance_char();
            }

            return Ok(MathCommand::Word(self.input[start..self.cursor].to_owned()));
        }

        self.advance_char();
        Ok(MathCommand::Symbol(character))
    }

    fn read_number(&mut self) -> String {
        let start = self.cursor;
        let mut seen_dot = false;

        while let Some(character) = self.peek_char() {
            if character.is_ascii_digit() {
                self.advance_char();
                continue;
            }

            if character == '.' && !seen_dot {
                seen_dot = true;
                self.advance_char();
                continue;
            }

            break;
        }

        self.input[start..self.cursor].to_owned()
    }

    fn is_number_start(&self) -> bool {
        match self.peek_char() {
            Some(character) if character.is_ascii_digit() => true,
            Some('.') => {
                let mut chars = self.input[self.cursor..].chars();
                chars.next();
                matches!(chars.next(), Some(next) if next.is_ascii_digit())
            }
            _ => false,
        }
    }

    fn skip_whitespace(&mut self) {
        while matches!(self.peek_char(), Some(character) if character.is_whitespace()) {
            self.advance_char();
        }
    }

    fn advance_char(&mut self) -> Option<char> {
        let character = self.peek_char()?;
        self.cursor += character.len_utf8();
        Some(character)
    }

    fn peek_char(&self) -> Option<char> {
        self.input[self.cursor..].chars().next()
    }

    fn is_eof(&self) -> bool {
        self.cursor >= self.input.len()
    }
}

fn delimiter_for_character(character: char) -> Result<String, MathParseError> {
    match character {
        '.' => Ok(String::new()),
        '(' | ')' | '[' | ']' | '{' | '}' | '|' => Ok(character.to_string()),
        _ => Err(MathParseError::new(format!(
            "unsupported delimiter `{character}`"
        ))),
    }
}

fn delimiter_for_command(command: &str) -> Option<&'static str> {
    match command {
        "langle" => Some("⟨"),
        "lbrace" => Some("{"),
        "lceil" => Some("⌈"),
        "lfloor" => Some("⌊"),
        "rangle" => Some("⟩"),
        "rbrace" => Some("}"),
        "rceil" => Some("⌉"),
        "rfloor" => Some("⌋"),
        "vert" => Some("|"),
        _ => None,
    }
}

fn is_identifier_character(character: char) -> bool {
    character.is_alphabetic()
}

fn math_operator_for_character(character: char) -> Option<&'static str> {
    match character {
        '!' => Some("!"),
        '(' => Some("("),
        ')' => Some(")"),
        '*' => Some("*"),
        '+' => Some("+"),
        ',' => Some(","),
        '-' => Some("-"),
        '.' => Some("."),
        '/' => Some("/"),
        ':' => Some(":"),
        ';' => Some(";"),
        '<' => Some("<"),
        '=' => Some("="),
        '>' => Some(">"),
        '?' => Some("?"),
        '[' => Some("["),
        ']' => Some("]"),
        '|' => Some("|"),
        _ => None,
    }
}

fn greek_command_symbol(command: &str) -> Option<&'static str> {
    match command {
        "Alpha" => Some("Α"),
        "Beta" => Some("Β"),
        "Delta" => Some("Δ"),
        "Epsilon" => Some("Ε"),
        "Gamma" => Some("Γ"),
        "Lambda" => Some("Λ"),
        "Omega" => Some("Ω"),
        "Phi" => Some("Φ"),
        "Pi" => Some("Π"),
        "Psi" => Some("Ψ"),
        "Sigma" => Some("Σ"),
        "Theta" => Some("Θ"),
        "Upsilon" => Some("Υ"),
        "Xi" => Some("Ξ"),
        "alpha" => Some("α"),
        "beta" => Some("β"),
        "chi" => Some("χ"),
        "delta" => Some("δ"),
        "epsilon" => Some("ϵ"),
        "eta" => Some("η"),
        "gamma" => Some("γ"),
        "iota" => Some("ι"),
        "kappa" => Some("κ"),
        "lambda" => Some("λ"),
        "mu" => Some("μ"),
        "nu" => Some("ν"),
        "omega" => Some("ω"),
        "phi" => Some("ϕ"),
        "pi" => Some("π"),
        "psi" => Some("ψ"),
        "rho" => Some("ρ"),
        "sigma" => Some("σ"),
        "tau" => Some("τ"),
        "theta" => Some("θ"),
        "upsilon" => Some("υ"),
        "varepsilon" => Some("ε"),
        "varphi" => Some("φ"),
        "varrho" => Some("ϱ"),
        "varsigma" => Some("ς"),
        "vartheta" => Some("ϑ"),
        "xi" => Some("ξ"),
        "zeta" => Some("ζ"),
        _ => None,
    }
}

fn operator_command_symbol(command: &str) -> Option<&'static str> {
    match command {
        "approx" => Some("≈"),
        "ast" => Some("∗"),
        "cdot" => Some("⋅"),
        "circ" => Some("∘"),
        "div" => Some("÷"),
        "ge" | "geq" => Some("≥"),
        "gets" | "leftarrow" => Some("←"),
        "infty" => Some("∞"),
        "int" => Some("∫"),
        "le" | "leq" => Some("≤"),
        "mp" => Some("∓"),
        "nabla" => Some("∇"),
        "neq" | "ne" => Some("≠"),
        "oint" => Some("∮"),
        "partial" => Some("∂"),
        "pm" => Some("±"),
        "prod" => Some("∏"),
        "rightarrow" | "to" => Some("→"),
        "sum" => Some("∑"),
        "times" => Some("×"),
        _ => None,
    }
}

fn function_command_identifier(command: &str) -> Option<&'static str> {
    match command {
        "arccos" => Some("arccos"),
        "arcsin" => Some("arcsin"),
        "arctan" => Some("arctan"),
        "cos" => Some("cos"),
        "det" => Some("det"),
        "dim" => Some("dim"),
        "exp" => Some("exp"),
        "ln" => Some("ln"),
        "log" => Some("log"),
        "max" => Some("max"),
        "min" => Some("min"),
        "sin" => Some("sin"),
        "tan" => Some("tan"),
        _ => None,
    }
}

fn escape_html(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());

    for character in text.chars() {
        match escape_html_character(character) {
            Some(entity) => escaped.push_str(entity),
            None => escaped.push(character),
        }
    }

    escaped
}

fn escape_html_attribute(text: &str) -> String {
    escape_html(text)
}

fn escape_html_character(character: char) -> Option<&'static str> {
    match character {
        '&' => Some("&amp;"),
        '"' => Some("&quot;"),
        '\'' => Some("&#39;"),
        '<' => Some("&lt;"),
        '>' => Some("&gt;"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{render_math_html, MarkdownMathDisplay};

    #[test]
    fn renders_fraction_as_mathml() {
        let html = render_math_html(r"v = \frac{dx}{dt}", MarkdownMathDisplay::Inline);

        assert!(html.contains("<mfrac>"));
        assert!(html.contains("<mi>v</mi>"));
    }

    #[test]
    fn renders_invalid_fraction_as_local_error() {
        let html = render_math_html(r"\frac{1}", MarkdownMathDisplay::Inline);

        assert!(html.contains("math-error"));
        assert!(html.contains(r"\frac{1}"));
    }
}
