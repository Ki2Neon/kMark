use std::fmt::Write as _;

pub const KMARK_PARAM_SCHEMA_VERSION: u32 = 1;

pub struct KmarkParamSpec {
    pub name: &'static str,
    pub aliases: &'static [&'static str],
    pub param_type: &'static str,
    pub contexts: &'static [&'static str],
    pub values: &'static [&'static str],
    pub insert_text: &'static str,
    pub description: &'static str,
    pub examples: &'static [&'static str],
    pub priority: u16,
}

pub const KMARK_PARAM_SPECS: &[KmarkParamSpec] = &[
    KmarkParamSpec {
        name: "align",
        aliases: &[],
        param_type: "enum",
        contexts: &["single", "scope", "text", "image"],
        values: &["left", "center", "right"],
        insert_text: "align:",
        description: "対象ブロックの横方向配置を指定する",
        examples: &["<!-- kmark align:right -->"],
        priority: 100,
    },
    KmarkParamSpec {
        name: "valign",
        aliases: &[],
        param_type: "enum",
        contexts: &["single", "scope", "text", "image"],
        values: &["top", "center", "bottom", "stretch"],
        insert_text: "valign:",
        description: "対象ブロックの縦方向配置を指定する",
        examples: &["<!-- kmark valign:top -->"],
        priority: 70,
    },
    KmarkParamSpec {
        name: "page_valign",
        aliases: &[],
        param_type: "enum",
        contexts: &["single", "scope", "text", "image"],
        values: &["top", "center", "bottom"],
        insert_text: "page_valign:",
        description: "対象ブロックを現在ページの本文エリア内で縦配置する",
        examples: &["<!-- kmark page_valign:bottom -->"],
        priority: 88,
    },
    KmarkParamSpec {
        name: "w",
        aliases: &["width"],
        param_type: "length",
        contexts: &["single", "image", "shape"],
        values: &[],
        insert_text: "w:",
        description: "対象要素の幅を指定する",
        examples: &["<!-- kmark w:200 -->", "<!-- kmark w:50% -->"],
        priority: 95,
    },
    KmarkParamSpec {
        name: "h",
        aliases: &["height"],
        param_type: "length",
        contexts: &["single", "image", "shape"],
        values: &[],
        insert_text: "h:",
        description: "対象要素の高さを指定する",
        examples: &["<!-- kmark h:100 -->"],
        priority: 95,
    },
    KmarkParamSpec {
        name: "fit",
        aliases: &[],
        param_type: "enum",
        contexts: &["image", "single"],
        values: &["contain", "cover", "fill", "none", "scale-down"],
        insert_text: "fit:",
        description: "画像や要素の収まり方を指定する",
        examples: &["<!-- kmark fit:contain -->"],
        priority: 90,
    },
    KmarkParamSpec {
        name: "pos",
        aliases: &[],
        param_type: "enum",
        contexts: &["single", "image"],
        values: &[
            "center",
            "top",
            "bottom",
            "left",
            "right",
            "top_left",
            "top_right",
            "bottom_left",
            "bottom_right",
        ],
        insert_text: "pos:",
        description: "画像や要素内の表示位置を指定する",
        examples: &["<!-- kmark pos:top_left -->"],
        priority: 70,
    },
    KmarkParamSpec {
        name: "border_size",
        aliases: &[],
        param_type: "length",
        contexts: &["single", "image", "scope", "shape"],
        values: &[],
        insert_text: "border_size:",
        description: "枠線の太さを指定する",
        examples: &["<!-- kmark border_size:2 -->"],
        priority: 80,
    },
    KmarkParamSpec {
        name: "border_color",
        aliases: &[],
        param_type: "color",
        contexts: &["single", "image", "scope", "shape"],
        values: &[],
        insert_text: "border_color:",
        description: "枠線の色を指定する",
        examples: &[
            "<!-- kmark border_color:red -->",
            "<!-- kmark border_color:#ff0000 -->",
        ],
        priority: 80,
    },
    KmarkParamSpec {
        name: "border_style",
        aliases: &[],
        param_type: "enum",
        contexts: &["single", "image", "scope", "shape"],
        values: &["solid", "dashed", "dotted", "double", "none"],
        insert_text: "border_style:",
        description: "枠線の種類を指定する",
        examples: &["<!-- kmark border_style:dashed -->"],
        priority: 75,
    },
    KmarkParamSpec {
        name: "radius",
        aliases: &[],
        param_type: "length",
        contexts: &["single", "image", "scope", "shape"],
        values: &[],
        insert_text: "radius:",
        description: "対象要素の角丸を指定する",
        examples: &["<!-- kmark radius:4px -->"],
        priority: 76,
    },
    KmarkParamSpec {
        name: "bg",
        aliases: &["background"],
        param_type: "color",
        contexts: &["single", "image", "scope", "shape"],
        values: &[],
        insert_text: "bg:",
        description: "対象要素の背景色を指定する",
        examples: &["<!-- kmark bg:#fff0f0 -->"],
        priority: 74,
    },
    KmarkParamSpec {
        name: "background",
        aliases: &["bg"],
        param_type: "color",
        contexts: &["single", "image", "scope", "shape"],
        values: &[],
        insert_text: "background:",
        description: "対象要素の背景色を指定する",
        examples: &["<!-- kmark background:#fff0f0 -->"],
        priority: 73,
    },
    KmarkParamSpec {
        name: "opacity",
        aliases: &[],
        param_type: "number",
        contexts: &["single", "image", "scope", "shape"],
        values: &[],
        insert_text: "opacity:",
        description: "対象要素の透明度を0から1で指定する",
        examples: &["<!-- kmark opacity:0.8 -->"],
        priority: 72,
    },
    KmarkParamSpec {
        name: "rotate",
        aliases: &[],
        param_type: "number",
        contexts: &["single", "image", "scope", "shape"],
        values: &[],
        insert_text: "rotate:",
        description: "対象要素の回転角度を指定する",
        examples: &["<!-- kmark rotate:-10 -->"],
        priority: 72,
    },
    KmarkParamSpec {
        name: "shadow",
        aliases: &[],
        param_type: "string",
        contexts: &["single", "image", "scope", "shape"],
        values: &[],
        insert_text: "shadow:",
        description: "対象要素の影を指定する",
        examples: &["<!-- kmark shadow:true -->", "<!-- kmark shadow:sm -->"],
        priority: 71,
    },
    KmarkParamSpec {
        name: "margin",
        aliases: &[],
        param_type: "length",
        contexts: &["single", "image", "scope", "shape"],
        values: &[],
        insert_text: "margin:",
        description: "対象要素の外側余白を指定する",
        examples: &["<!-- kmark margin:2mm -->"],
        priority: 70,
    },
    KmarkParamSpec {
        name: "padding",
        aliases: &[],
        param_type: "length",
        contexts: &["single", "image", "scope", "shape"],
        values: &[],
        insert_text: "padding:",
        description: "対象要素の内側余白を指定する",
        examples: &["<!-- kmark padding:2mm 4mm -->"],
        priority: 70,
    },
    KmarkParamSpec {
        name: "color",
        aliases: &[],
        param_type: "color",
        contexts: &["single", "text", "scope"],
        values: &[],
        insert_text: "color:",
        description: "文字色を指定する",
        examples: &["<!-- kmark color:red -->\n重要"],
        priority: 78,
    },
    KmarkParamSpec {
        name: "font_weight",
        aliases: &[],
        param_type: "string",
        contexts: &["single", "text", "scope"],
        values: &[
            "normal", "bold", "bolder", "lighter", "100", "200", "300", "400", "500", "600", "700",
            "800", "900",
        ],
        insert_text: "font_weight:",
        description: "文字の太さを指定する",
        examples: &["<!-- kmark font_weight:bold -->\n承認済"],
        priority: 77,
    },
    KmarkParamSpec {
        name: "font_family",
        aliases: &[],
        param_type: "string",
        contexts: &["single", "text", "scope"],
        values: &[],
        insert_text: "font_family:",
        description: "文字のfont familyを指定する",
        examples: &["<!-- kmark font_family:\"Yu Gothic\" -->\n社外秘"],
        priority: 76,
    },
    KmarkParamSpec {
        name: "font_style",
        aliases: &[],
        param_type: "enum",
        contexts: &["single", "text", "scope"],
        values: &["normal", "italic", "oblique"],
        insert_text: "font_style:",
        description: "文字styleを指定する",
        examples: &["<!-- kmark font_style:italic -->\nDRAFT"],
        priority: 75,
    },
    KmarkParamSpec {
        name: "letter_spacing",
        aliases: &[],
        param_type: "length",
        contexts: &["single", "text", "scope"],
        values: &[],
        insert_text: "letter_spacing:",
        description: "文字間隔を指定する",
        examples: &["<!-- kmark letter_spacing:0.08em -->\nCONFIDENTIAL"],
        priority: 74,
    },
    KmarkParamSpec {
        name: "line_height",
        aliases: &[],
        param_type: "string",
        contexts: &["single", "text", "scope"],
        values: &[],
        insert_text: "line_height:",
        description: "行高を指定する",
        examples: &["<!-- kmark line_height:1.2 -->\n承認済"],
        priority: 73,
    },
    KmarkParamSpec {
        name: "layout",
        aliases: &[],
        param_type: "enum",
        contexts: &["scope"],
        values: &["row", "column"],
        insert_text: "layout:",
        description: "スコープ内の要素配置を指定する",
        examples: &["<!-- kmark { layout:row } -->"],
        priority: 100,
    },
    KmarkParamSpec {
        name: "gap",
        aliases: &[],
        param_type: "length",
        contexts: &["scope"],
        values: &[],
        insert_text: "gap:",
        description: "スコープ内の要素間隔を指定する",
        examples: &["<!-- kmark { layout:row gap:8 } -->"],
        priority: 85,
    },
    KmarkParamSpec {
        name: "wrap",
        aliases: &[],
        param_type: "boolean",
        contexts: &["scope"],
        values: &[],
        insert_text: "wrap:",
        description: "横並び要素の折り返しを有効にする",
        examples: &["<!-- kmark { layout:row wrap:true } -->"],
        priority: 80,
    },
    KmarkParamSpec {
        name: "page_size",
        aliases: &[],
        param_type: "enum",
        contexts: &["page", "scope"],
        values: &["A3", "A4", "A5", "B4", "B5", "Letter", "Legal", "custom"],
        insert_text: "page_size:",
        description: "ページサイズを指定する",
        examples: &["<!-- kmark { page_size:A4 } -->"],
        priority: 100,
    },
    KmarkParamSpec {
        name: "orientation",
        aliases: &["page_orientation"],
        param_type: "enum",
        contexts: &["page", "scope"],
        values: &["portrait", "landscape"],
        insert_text: "orientation:",
        description: "ページの向きを指定する",
        examples: &["<!-- kmark { orientation:landscape } -->"],
        priority: 95,
    },
    KmarkParamSpec {
        name: "page_width",
        aliases: &[],
        param_type: "length",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_width:",
        description: "customページの幅を指定する",
        examples: &["<!-- kmark { page_size:custom page_width:210mm } -->"],
        priority: 60,
    },
    KmarkParamSpec {
        name: "page_height",
        aliases: &[],
        param_type: "length",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_height:",
        description: "customページの高さを指定する",
        examples: &["<!-- kmark { page_size:custom page_height:297mm } -->"],
        priority: 60,
    },
    KmarkParamSpec {
        name: "font_size",
        aliases: &[],
        param_type: "length",
        contexts: &["single", "text", "page", "scope"],
        values: &[],
        insert_text: "font_size:",
        description: "文字サイズまたは用紙表示の文字サイズを指定する",
        examples: &[
            "<!-- kmark font_size:12pt -->\n重要",
            "<!-- kmark { font_size:12pt } -->",
        ],
        priority: 80,
    },
    KmarkParamSpec {
        name: "page_margin",
        aliases: &[],
        param_type: "length",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_margin:",
        description: "用紙表示の余白を指定する",
        examples: &["<!-- kmark { page_margin:10mm } -->"],
        priority: 75,
    },
    KmarkParamSpec {
        name: "page_margin_top",
        aliases: &[],
        param_type: "length",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_margin_top:",
        description: "用紙表示の上余白を指定する",
        examples: &["<!-- kmark { page_margin_top:10mm } -->"],
        priority: 55,
    },
    KmarkParamSpec {
        name: "page_margin_right",
        aliases: &[],
        param_type: "length",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_margin_right:",
        description: "用紙表示の右余白を指定する",
        examples: &["<!-- kmark { page_margin_right:10mm } -->"],
        priority: 55,
    },
    KmarkParamSpec {
        name: "page_margin_bottom",
        aliases: &[],
        param_type: "length",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_margin_bottom:",
        description: "用紙表示の下余白を指定する",
        examples: &["<!-- kmark { page_margin_bottom:10mm } -->"],
        priority: 55,
    },
    KmarkParamSpec {
        name: "page_margin_left",
        aliases: &[],
        param_type: "length",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_margin_left:",
        description: "用紙表示の左余白を指定する",
        examples: &["<!-- kmark { page_margin_left:10mm } -->"],
        priority: 55,
    },
    KmarkParamSpec {
        name: "page_number",
        aliases: &[],
        param_type: "enum",
        contexts: &["page", "scope"],
        values: &[
            "show",
            "hide",
            "none",
            "top-left",
            "top-center",
            "top-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
        ],
        insert_text: "page_number:",
        description: "ページ番号の表示位置を指定する",
        examples: &["<!-- kmark { page_number:bottom-center } -->"],
        priority: 90,
    },
    KmarkParamSpec {
        name: "page_number_format",
        aliases: &[],
        param_type: "string",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_number_format:\"{page}\"",
        description: "ページ番号の表示形式を指定する",
        examples: &["<!-- kmark { page_number_format:\"{page} / {total}\" } -->"],
        priority: 86,
    },
    KmarkParamSpec {
        name: "page_number_start",
        aliases: &[],
        param_type: "number",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_number_start:",
        description: "表示ページ番号の開始番号を指定する",
        examples: &["<!-- kmark { page_number_start:1 } -->"],
        priority: 84,
    },
    KmarkParamSpec {
        name: "page_number_reset",
        aliases: &[],
        param_type: "boolean",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_number_reset:",
        description: "このスコープからページ番号グループをリセットする",
        examples: &["<!-- kmark { page_number_reset:true } -->"],
        priority: 83,
    },
    KmarkParamSpec {
        name: "page_number_count",
        aliases: &[],
        param_type: "boolean",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_number_count:",
        description: "このページをページ番号カウントに含めるか指定する",
        examples: &["<!-- kmark { page_number_count:false } -->"],
        priority: 82,
    },
    KmarkParamSpec {
        name: "page_number_visible",
        aliases: &[],
        param_type: "boolean",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_number_visible:",
        description: "ページ番号設定を維持したまま表示有無を指定する",
        examples: &["<!-- kmark { page_number_visible:false } -->"],
        priority: 81,
    },
    KmarkParamSpec {
        name: "page_number_style",
        aliases: &[],
        param_type: "enum",
        contexts: &["page", "scope"],
        values: &[
            "decimal",
            "lower-roman",
            "upper-roman",
            "lower-alpha",
            "upper-alpha",
        ],
        insert_text: "page_number_style:",
        description: "ページ番号の表記スタイルを指定する",
        examples: &["<!-- kmark { page_number_style:lower-roman } -->"],
        priority: 80,
    },
    KmarkParamSpec {
        name: "page_number_font_size",
        aliases: &[],
        param_type: "length",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_number_font_size:",
        description: "ページ番号の文字サイズを指定する",
        examples: &["<!-- kmark { page_number_font_size:10pt } -->"],
        priority: 74,
    },
    KmarkParamSpec {
        name: "page_number_color",
        aliases: &[],
        param_type: "color",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_number_color:",
        description: "ページ番号の文字色を指定する",
        examples: &["<!-- kmark { page_number_color:#666 } -->"],
        priority: 73,
    },
    KmarkParamSpec {
        name: "page_number_margin_top",
        aliases: &[],
        param_type: "length",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_number_margin_top:",
        description: "ページ番号の上端距離を指定する",
        examples: &["<!-- kmark { page_number_margin_top:8mm } -->"],
        priority: 62,
    },
    KmarkParamSpec {
        name: "page_number_margin_bottom",
        aliases: &[],
        param_type: "length",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_number_margin_bottom:",
        description: "ページ番号の下端距離を指定する",
        examples: &["<!-- kmark { page_number_margin_bottom:8mm } -->"],
        priority: 62,
    },
    KmarkParamSpec {
        name: "page_number_margin_left",
        aliases: &[],
        param_type: "length",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_number_margin_left:",
        description: "ページ番号の左端距離を指定する",
        examples: &["<!-- kmark { page_number_margin_left:12mm } -->"],
        priority: 61,
    },
    KmarkParamSpec {
        name: "page_number_margin_right",
        aliases: &[],
        param_type: "length",
        contexts: &["page", "scope"],
        values: &[],
        insert_text: "page_number_margin_right:",
        description: "ページ番号の右端距離を指定する",
        examples: &["<!-- kmark { page_number_margin_right:12mm } -->"],
        priority: 61,
    },
    KmarkParamSpec {
        name: "define",
        aliases: &[],
        param_type: "identifier",
        contexts: &["single", "scope", "page"],
        values: &[],
        insert_text: "define:",
        description: "現在のパラメータセットに名前を付ける",
        examples: &["<!-- kmark define:image_large w:300 h:200 -->"],
        priority: 65,
    },
    KmarkParamSpec {
        name: "use",
        aliases: &[],
        param_type: "identifier",
        contexts: &["single", "scope", "page"],
        values: &[],
        insert_text: "use:",
        description: "定義済みのパラメータセットを使用する",
        examples: &["<!-- kmark use:image_large -->"],
        priority: 90,
    },
];

pub fn kmark_param_schema_json() -> String {
    let mut output = String::new();
    output.push_str("{\n");
    writeln!(output, "  \"schemaVersion\": {KMARK_PARAM_SCHEMA_VERSION},")
        .expect("schema json write failed");
    output.push_str("  \"params\": [\n");

    for (index, spec) in KMARK_PARAM_SPECS.iter().enumerate() {
        write_param_spec_json(&mut output, spec);

        if index + 1 < KMARK_PARAM_SPECS.len() {
            output.push_str(",");
        }

        output.push_str("\n");
    }

    output.push_str("  ]\n");
    output.push_str("}\n");
    output
}

fn write_param_spec_json(output: &mut String, spec: &KmarkParamSpec) {
    output.push_str("    {\n");
    write_string_field(output, 6, "name", spec.name, true);
    write_string_array_field(output, 6, "aliases", spec.aliases, true);
    write_string_field(output, 6, "type", spec.param_type, true);
    write_string_array_field(output, 6, "contexts", spec.contexts, true);

    if !spec.values.is_empty() {
        write_string_array_field(output, 6, "values", spec.values, true);
    }

    write_string_field(output, 6, "insertText", spec.insert_text, true);
    write_string_field(output, 6, "description", spec.description, true);
    write_string_array_field(output, 6, "examples", spec.examples, true);
    writeln!(output, "      \"priority\": {}", spec.priority).expect("schema json write failed");
    output.push_str("    }");
}

fn write_string_field(
    output: &mut String,
    indent: usize,
    key: &str,
    value: &str,
    trailing_comma: bool,
) {
    write_indent(output, indent);
    push_json_string(output, key);
    output.push_str(": ");
    push_json_string(output, value);

    if trailing_comma {
        output.push_str(",");
    }

    output.push_str("\n");
}

fn write_string_array_field(
    output: &mut String,
    indent: usize,
    key: &str,
    values: &[&str],
    trailing_comma: bool,
) {
    write_indent(output, indent);
    push_json_string(output, key);
    output.push_str(": [");

    for (index, value) in values.iter().enumerate() {
        if index > 0 {
            output.push_str(", ");
        }

        push_json_string(output, value);
    }

    output.push_str("]");

    if trailing_comma {
        output.push_str(",");
    }

    output.push_str("\n");
}

fn write_indent(output: &mut String, indent: usize) {
    for _ in 0..indent {
        output.push(' ');
    }
}

fn push_json_string(output: &mut String, value: &str) {
    output.push('"');

    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            character if character.is_control() => {
                write!(output, "\\u{:04x}", character as u32).expect("schema json write failed");
            }
            character => output.push(character),
        }
    }

    output.push('"');
}

#[cfg(test)]
mod tests {
    use super::kmark_param_schema_json;

    #[test]
    fn generated_frontend_schema_is_in_sync() {
        let frontend_schema =
            include_str!("../../../src/features/kmark-completion/schema/kmark-param-schema.json");

        assert_eq!(
            frontend_schema.replace("\r\n", "\n"),
            kmark_param_schema_json()
        );
    }
}
