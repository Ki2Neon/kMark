use std::{
    collections::{HashMap, HashSet},
    ffi::OsStr,
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    process::Command,
    time::SystemTime,
};

use kmark_core::{KmarkModelAssetError, KmarkModelAssetResolution};
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ModelFormat {
    Glb,
    Gltf,
    Obj,
    Stl,
    Fbx,
}

#[derive(Debug, Clone)]
struct ModelReference {
    destination: String,
    convert: ModelConvertMode,
    options: ModelConvertOptions,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ModelConvertMode {
    Auto,
    Never,
    Force,
}

#[derive(Debug, Clone)]
struct ModelConvertOptions {
    force: bool,
    scale: f32,
    up: ModelUpAxis,
    center: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ModelUpAxis {
    Auto,
    X,
    Y,
    Z,
    NegativeX,
    NegativeY,
    NegativeZ,
}

#[derive(Debug, Clone)]
struct MeshData {
    positions: Vec<[f32; 3]>,
    normals: Vec<[f32; 3]>,
    texcoords: Option<Vec<[f32; 2]>>,
    indices: Vec<u32>,
}

pub fn prepare_markdown_model_assets(
    markdown_file_path: Option<&str>,
    content: &str,
) -> HashMap<String, KmarkModelAssetResolution> {
    let Some(markdown_file_path) = markdown_file_path else {
        return HashMap::new();
    };
    let markdown_path = PathBuf::from(markdown_file_path);
    let Some(markdown_root) = markdown_path.parent() else {
        return HashMap::new();
    };

    collect_model_references(content)
        .into_iter()
        .map(|reference| {
            let destination = reference.destination.clone();
            let resolution = prepare_one_model_asset(markdown_root, &reference);

            (destination, resolution)
        })
        .collect()
}

fn prepare_one_model_asset(
    markdown_root: &Path,
    reference: &ModelReference,
) -> KmarkModelAssetResolution {
    let Some(format) = model_format_for_destination(&reference.destination) else {
        return model_error(
            "3Dモデルを読み込めませんでした",
            vec![format!("対象: {}", reference.destination)],
        );
    };

    if format == ModelFormat::Glb {
        return KmarkModelAssetResolution {
            display_destination_url: Some(reference.destination.clone()),
            error: None,
        };
    }

    if reference.convert == ModelConvertMode::Never {
        return model_error(
            "この形式はGLB変換なしでは表示できません",
            vec![format!("対象: {}", reference.destination)],
        );
    }

    let Some(source_path) = resolve_local_model_path(markdown_root, &reference.destination) else {
        return model_error(
            "3Dモデルを読み込めませんでした",
            vec![format!("対象: {}", reference.destination)],
        );
    };

    if !source_path.is_file() {
        return model_error(
            "3Dモデルを読み込めませんでした",
            vec![format!("対象: {}", reference.destination)],
        );
    }

    let converted_path = converted_model_path(markdown_root, &source_path);
    let display_destination = converted_path
        .file_name()
        .map(|file_name| file_name.to_string_lossy().into_owned())
        .unwrap_or_else(|| converted_path.to_string_lossy().into_owned());

    let related_paths = collect_related_model_paths(&source_path, format);
    let force = reference.convert == ModelConvertMode::Force || reference.options.force;

    if !force && is_conversion_cache_fresh(&source_path, &related_paths, &converted_path) {
        return KmarkModelAssetResolution {
            display_destination_url: Some(display_destination),
            error: None,
        };
    }

    match convert_model_to_glb(&source_path, &converted_path, format, &reference.options) {
        Ok(()) => KmarkModelAssetResolution {
            display_destination_url: Some(display_destination),
            error: None,
        },
        Err(error) => model_error(
            "3DモデルをGLBに変換できませんでした",
            vec![
                format!("形式: .{}", extension_for_format(format)),
                format!("元ファイル: {}", reference.destination),
                format!("理由: {error}"),
            ],
        ),
    }
}

fn model_error(title: impl Into<String>, details: Vec<String>) -> KmarkModelAssetResolution {
    KmarkModelAssetResolution {
        display_destination_url: None,
        error: Some(KmarkModelAssetError {
            title: title.into(),
            details,
        }),
    }
}

fn collect_model_references(content: &str) -> Vec<ModelReference> {
    let mut references = Vec::new();
    let mut pending_kmark: Option<String> = None;

    for line in content.lines() {
        if let Some(kmark_body) = parse_kmark_comment_body(line) {
            pending_kmark = Some(kmark_body.to_owned());
            continue;
        }

        if let Some(destination) = extract_markdown_image_destination(line) {
            if is_model_destination(&destination) {
                let params = pending_kmark
                    .as_deref()
                    .map(parse_model_convert_params)
                    .unwrap_or_default();
                references.push(ModelReference {
                    destination,
                    convert: params.convert,
                    options: params.options,
                });
            }
            pending_kmark = None;
            continue;
        }

        if !line.trim().is_empty() {
            pending_kmark = None;
        }
    }

    references
}

#[derive(Default)]
struct ParsedModelConvertParams {
    convert: ModelConvertMode,
    options: ModelConvertOptions,
}

impl Default for ModelConvertMode {
    fn default() -> Self {
        Self::Auto
    }
}

impl Default for ModelConvertOptions {
    fn default() -> Self {
        Self {
            force: false,
            scale: 1.0,
            up: ModelUpAxis::Z,
            center: true,
        }
    }
}

fn parse_model_convert_params(input: &str) -> ParsedModelConvertParams {
    let mut parsed = ParsedModelConvertParams::default();

    for (key, value) in split_kmark_param_pairs(input) {
        match key.as_str() {
            "3d_convert" => match trim_kmark_quotes(&value).trim() {
                "never" => parsed.convert = ModelConvertMode::Never,
                "force" => parsed.convert = ModelConvertMode::Force,
                "auto" => parsed.convert = ModelConvertMode::Auto,
                _ => {}
            },
            "3d_convert_force" => {
                if let Some(force) = parse_bool(&value) {
                    parsed.options.force = force;
                }
            }
            "3d_convert_scale" => {
                if let Ok(scale) = trim_kmark_quotes(&value).trim().parse::<f32>() {
                    if scale.is_finite() && scale > 0.0 {
                        parsed.options.scale = scale;
                    }
                }
            }
            "3d_convert_up" => {
                if let Some(up) = parse_model_up_axis(&value) {
                    parsed.options.up = up;
                }
            }
            "3d_convert_center" => {
                if let Some(center) = parse_bool(&value) {
                    parsed.options.center = center;
                }
            }
            _ => {}
        }
    }

    parsed
}

fn parse_kmark_comment_body(line: &str) -> Option<&str> {
    let trimmed = line.trim();
    let body = trimmed.strip_prefix("<!--")?.strip_suffix("-->")?.trim();

    Some(body.strip_prefix("kmark")?.trim())
}

fn split_kmark_param_pairs(input: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();

    for token in split_kmark_tokens(input) {
        if token.chars().all(|character| character == '}') {
            continue;
        }

        if let Some((key, value)) = token.split_once(':') {
            pairs.push((key.to_owned(), value.to_owned()));
            continue;
        }

        if let Some((_, value)) = pairs.last_mut() {
            if !value.is_empty() {
                value.push(' ');
            }
            value.push_str(&token);
        }
    }

    pairs
}

fn split_kmark_tokens(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;

    for character in input.chars() {
        match character {
            '"' | '\'' if quote == Some(character) => {
                current.push(character);
                quote = None;
            }
            '"' | '\'' if quote.is_none() => {
                current.push(character);
                quote = Some(character);
            }
            character if character.is_whitespace() && quote.is_none() => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(character),
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn trim_kmark_quotes(value: &str) -> &str {
    let trimmed = value.trim();

    if trimmed.len() < 2 {
        return trimmed;
    }

    let first = trimmed.chars().next();
    let last = trimmed.chars().last();

    if matches!(first, Some('"') | Some('\'')) && first == last {
        return &trimmed[1..trimmed.len() - 1];
    }

    trimmed
}

fn parse_bool(value: &str) -> Option<bool> {
    match trim_kmark_quotes(value).trim() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

fn parse_model_up_axis(value: &str) -> Option<ModelUpAxis> {
    match trim_kmark_quotes(value).trim() {
        "auto" => Some(ModelUpAxis::Auto),
        "x" => Some(ModelUpAxis::X),
        "y" => Some(ModelUpAxis::Y),
        "z" => Some(ModelUpAxis::Z),
        "-x" => Some(ModelUpAxis::NegativeX),
        "-y" => Some(ModelUpAxis::NegativeY),
        "-z" => Some(ModelUpAxis::NegativeZ),
        _ => None,
    }
}

fn extract_markdown_image_destination(line: &str) -> Option<String> {
    let image_start = line.find("![")?;
    let after_alt = line[image_start + 2..].find("](")? + image_start + 4;
    let destination = &line[after_alt..];
    let trimmed = destination.trim_start();

    if let Some(rest) = trimmed.strip_prefix('<') {
        let end = rest.find('>')?;
        return Some(rest[..end].trim().to_owned());
    }

    let end = trimmed
        .find(|character: char| character == ')' || character.is_whitespace())
        .unwrap_or(trimmed.len());
    let value = trimmed[..end].trim();

    (!value.is_empty()).then(|| value.to_owned())
}

fn is_model_destination(destination: &str) -> bool {
    model_format_for_destination(destination).is_some()
}

fn model_format_for_destination(destination: &str) -> Option<ModelFormat> {
    let (path, _) = split_resource_path_and_suffix(destination.trim());
    let extension = Path::new(path)
        .extension()
        .and_then(OsStr::to_str)?
        .to_ascii_lowercase();

    match extension.as_str() {
        "glb" => Some(ModelFormat::Glb),
        "gltf" => Some(ModelFormat::Gltf),
        "obj" => Some(ModelFormat::Obj),
        "stl" => Some(ModelFormat::Stl),
        "fbx" => Some(ModelFormat::Fbx),
        _ => None,
    }
}

fn extension_for_format(format: ModelFormat) -> &'static str {
    match format {
        ModelFormat::Glb => "glb",
        ModelFormat::Gltf => "gltf",
        ModelFormat::Obj => "obj",
        ModelFormat::Stl => "stl",
        ModelFormat::Fbx => "fbx",
    }
}

fn split_resource_path_and_suffix(resource: &str) -> (&str, &str) {
    let suffix_start = resource.find(['?', '#']).unwrap_or(resource.len());

    (&resource[..suffix_start], &resource[suffix_start..])
}

fn resolve_local_model_path(markdown_root: &Path, destination: &str) -> Option<PathBuf> {
    let (resource_path, _) = split_resource_path_and_suffix(destination.trim());

    if resource_path.is_empty()
        || resource_path.starts_with("//")
        || resource_path.contains("://")
        || resource_path.starts_with("data:")
    {
        return None;
    }

    let path = PathBuf::from(resource_path);

    if path.is_absolute() || is_windows_absolute_path(resource_path) {
        return Some(path);
    }

    Some(markdown_root.join(path))
}

fn is_windows_absolute_path(path: &str) -> bool {
    let bytes = path.as_bytes();

    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'\\' | b'/')
}

fn converted_model_path(markdown_root: &Path, source_path: &Path) -> PathBuf {
    let stem = source_path
        .file_stem()
        .and_then(OsStr::to_str)
        .filter(|stem| !stem.is_empty())
        .unwrap_or("model");

    markdown_root.join(format!("{stem}_converted.glb"))
}

fn collect_related_model_paths(source_path: &Path, format: ModelFormat) -> Vec<PathBuf> {
    match format {
        ModelFormat::Obj => collect_obj_related_paths(source_path),
        ModelFormat::Gltf => collect_gltf_related_paths(source_path),
        ModelFormat::Fbx => collect_fbx_related_paths(source_path),
        ModelFormat::Glb | ModelFormat::Stl => Vec::new(),
    }
}

fn is_conversion_cache_fresh(
    source_path: &Path,
    related_paths: &[PathBuf],
    converted_path: &Path,
) -> bool {
    if !is_valid_glb(converted_path) {
        return false;
    }

    let Ok(converted_modified) = file_modified_at(converted_path) else {
        return false;
    };

    std::iter::once(source_path)
        .chain(related_paths.iter().map(PathBuf::as_path))
        .filter_map(|path| file_modified_at(path).ok())
        .all(|modified| modified <= converted_modified)
}

fn file_modified_at(path: &Path) -> io::Result<SystemTime> {
    fs::metadata(path)?.modified()
}

fn is_valid_glb(path: &Path) -> bool {
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let mut header = [0_u8; 12];

    if file.read_exact(&mut header).is_err() {
        return false;
    }

    &header[0..4] == b"glTF" && u32::from_le_bytes(header[4..8].try_into().unwrap()) == 2
}

fn convert_model_to_glb(
    source_path: &Path,
    destination_path: &Path,
    format: ModelFormat,
    options: &ModelConvertOptions,
) -> Result<(), String> {
    let result = match format {
        ModelFormat::Gltf => convert_gltf_to_glb(source_path, destination_path),
        ModelFormat::Obj => convert_obj_to_glb(source_path, destination_path, options),
        ModelFormat::Stl => convert_stl_to_glb(source_path, destination_path, options),
        ModelFormat::Fbx => convert_fbx_to_glb(source_path, destination_path),
        ModelFormat::Glb => Ok(()),
    };

    if result.is_err() {
        let _ = fs::remove_file(destination_path);
    }

    result?;

    if is_valid_glb(destination_path) {
        Ok(())
    } else {
        Err("生成されたGLBを検証できません".to_owned())
    }
}

fn convert_stl_to_glb(
    source_path: &Path,
    destination_path: &Path,
    options: &ModelConvertOptions,
) -> Result<(), String> {
    let bytes = fs::read(source_path).map_err(|error| error.to_string())?;
    let mut mesh = parse_stl_mesh(&bytes)?;

    apply_model_transform(&mut mesh, options);
    write_mesh_glb(destination_path, &mesh, [0.8, 0.8, 0.8, 1.0])
}

fn convert_obj_to_glb(
    source_path: &Path,
    destination_path: &Path,
    options: &ModelConvertOptions,
) -> Result<(), String> {
    let content = fs::read_to_string(source_path).map_err(|error| error.to_string())?;
    let mut mesh = parse_obj_mesh(&content)?;

    apply_model_transform(&mut mesh, options);
    write_mesh_glb(destination_path, &mesh, [0.8, 0.8, 0.8, 1.0])
}

fn convert_gltf_to_glb(source_path: &Path, destination_path: &Path) -> Result<(), String> {
    let source_text = fs::read_to_string(source_path).map_err(|error| error.to_string())?;
    let mut document: Value =
        serde_json::from_str(&source_text).map_err(|error| error.to_string())?;
    let source_directory = source_path.parent().unwrap_or_else(|| Path::new("."));
    let buffers = document
        .get("buffers")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut bin = Vec::new();
    let mut buffer_offsets = Vec::with_capacity(buffers.len());

    for buffer in &buffers {
        let uri = buffer
            .get("uri")
            .and_then(Value::as_str)
            .ok_or_else(|| "外部buffer URIを解決できません".to_owned())?;
        let bytes = read_external_gltf_uri(source_directory, uri)?;

        align_bytes(&mut bin, 4, 0);
        buffer_offsets.push(bin.len() as u64);
        bin.extend_from_slice(&bytes);
    }

    if let Some(buffer_views) = document
        .get_mut("bufferViews")
        .and_then(Value::as_array_mut)
    {
        for buffer_view in buffer_views {
            let buffer_index = buffer_view
                .get("buffer")
                .and_then(Value::as_u64)
                .unwrap_or(0) as usize;
            let base_offset = buffer_offsets.get(buffer_index).copied().unwrap_or(0);
            let byte_offset = buffer_view
                .get("byteOffset")
                .and_then(Value::as_u64)
                .unwrap_or(0);

            buffer_view["buffer"] = json!(0);
            buffer_view["byteOffset"] = json!(base_offset + byte_offset);
        }
    }

    embed_gltf_images(source_directory, &mut document, &mut bin)?;
    document["buffers"] = json!([{ "byteLength": bin.len() }]);

    write_glb(destination_path, &mut document, &bin)
}

fn read_external_gltf_uri(source_directory: &Path, uri: &str) -> Result<Vec<u8>, String> {
    if uri.starts_with("data:") {
        return Err("data URI bufferは初期実装では未対応".to_owned());
    }

    let (path, _) = split_resource_path_and_suffix(uri);
    fs::read(source_directory.join(path)).map_err(|error| error.to_string())
}

fn embed_gltf_images(
    source_directory: &Path,
    document: &mut Value,
    bin: &mut Vec<u8>,
) -> Result<(), String> {
    let image_uris = document
        .get("images")
        .and_then(Value::as_array)
        .map(|images| {
            images
                .iter()
                .enumerate()
                .filter_map(|(index, image)| {
                    image
                        .get("uri")
                        .and_then(Value::as_str)
                        .map(|uri| (index, uri.to_owned()))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if image_uris.is_empty() {
        return Ok(());
    };

    for (image_index, uri) in image_uris {
        if uri.starts_with("data:") {
            continue;
        }

        let (path, _) = split_resource_path_and_suffix(&uri);
        let bytes = fs::read(source_directory.join(path)).map_err(|error| error.to_string())?;
        align_bytes(bin, 4, 0);
        let byte_offset = bin.len();
        let byte_length = bytes.len();
        bin.extend_from_slice(&bytes);

        let buffer_view_index = {
            let buffer_views = document
                .get_mut("bufferViews")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| "glTF bufferViewを更新できません".to_owned())?;
            let buffer_view_index = buffer_views.len();
            buffer_views.push(json!({
                "buffer": 0,
                "byteOffset": byte_offset,
                "byteLength": byte_length,
            }));
            buffer_view_index
        };

        if let Some(image) = document
            .get_mut("images")
            .and_then(Value::as_array_mut)
            .and_then(|images| images.get_mut(image_index))
        {
            image["bufferView"] = json!(buffer_view_index);
            image["mimeType"] = json!(mime_type_for_path(Path::new(path)));
            if let Some(object) = image.as_object_mut() {
                object.remove("uri");
            }
        }
    }

    Ok(())
}

fn convert_fbx_to_glb(source_path: &Path, destination_path: &Path) -> Result<(), String> {
    if run_assimp_export(source_path, destination_path).is_ok() {
        return Ok(());
    }

    if run_blender_fbx_export(source_path, destination_path).is_ok() {
        return Ok(());
    }

    Err("FBX変換backend未検出 assimp または blender が必要".to_owned())
}

fn run_assimp_export(source_path: &Path, destination_path: &Path) -> Result<(), String> {
    let output = Command::new("assimp")
        .arg("export")
        .arg(source_path)
        .arg(destination_path)
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

fn run_blender_fbx_export(source_path: &Path, destination_path: &Path) -> Result<(), String> {
    let script = format!(
        "import bpy\nbpy.ops.object.select_all(action='SELECT')\nbpy.ops.object.delete()\nbpy.ops.import_scene.fbx(filepath={})\nbpy.ops.export_scene.gltf(filepath={}, export_format='GLB')",
        python_string_literal(source_path),
        python_string_literal(destination_path),
    );
    let output = Command::new("blender")
        .arg("--background")
        .arg("--python-expr")
        .arg(script)
        .output()
        .map_err(|error| error.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

fn python_string_literal(path: &Path) -> String {
    format!("{:?}", path.to_string_lossy())
}

fn parse_stl_mesh(bytes: &[u8]) -> Result<MeshData, String> {
    if bytes.len() >= 84 {
        let triangle_count = u32::from_le_bytes(bytes[80..84].try_into().unwrap()) as usize;
        let expected_len = 84usize.saturating_add(triangle_count.saturating_mul(50));

        if expected_len == bytes.len() {
            return parse_binary_stl_mesh(bytes, triangle_count);
        }
    }

    let text = std::str::from_utf8(bytes).map_err(|error| error.to_string())?;
    parse_ascii_stl_mesh(text)
}

fn parse_binary_stl_mesh(bytes: &[u8], triangle_count: usize) -> Result<MeshData, String> {
    let mut positions = Vec::with_capacity(triangle_count * 3);
    let mut normals = Vec::with_capacity(triangle_count * 3);
    let mut indices = Vec::with_capacity(triangle_count * 3);
    let mut cursor = 84;

    for _ in 0..triangle_count {
        let normal = [
            read_f32_le(bytes, cursor)?,
            read_f32_le(bytes, cursor + 4)?,
            read_f32_le(bytes, cursor + 8)?,
        ];
        cursor += 12;

        for _ in 0..3 {
            let vertex = [
                read_f32_le(bytes, cursor)?,
                read_f32_le(bytes, cursor + 4)?,
                read_f32_le(bytes, cursor + 8)?,
            ];
            cursor += 12;
            positions.push(vertex);
            normals.push(normal);
            indices.push((indices.len()) as u32);
        }

        cursor += 2;
    }

    Ok(MeshData {
        positions,
        normals,
        texcoords: None,
        indices,
    })
}

fn read_f32_le(bytes: &[u8], offset: usize) -> Result<f32, String> {
    let chunk = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| "STL binaryを読み込めません".to_owned())?;

    Ok(f32::from_le_bytes(chunk.try_into().unwrap()))
}

fn parse_ascii_stl_mesh(text: &str) -> Result<MeshData, String> {
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut indices = Vec::new();
    let mut facet_normal = [0.0, 1.0, 0.0];
    let mut triangle = Vec::with_capacity(3);

    for line in text.lines() {
        let parts = line.split_whitespace().collect::<Vec<_>>();

        match parts.as_slice() {
            ["facet", "normal", x, y, z, ..] => {
                facet_normal = [
                    parse_f32(x, "STL normal")?,
                    parse_f32(y, "STL normal")?,
                    parse_f32(z, "STL normal")?,
                ];
            }
            ["vertex", x, y, z, ..] => {
                triangle.push([
                    parse_f32(x, "STL vertex")?,
                    parse_f32(y, "STL vertex")?,
                    parse_f32(z, "STL vertex")?,
                ]);

                if triangle.len() == 3 {
                    for vertex in triangle.drain(..) {
                        positions.push(vertex);
                        normals.push(facet_normal);
                        indices.push(indices.len() as u32);
                    }
                }
            }
            _ => {}
        }
    }

    if positions.is_empty() {
        return Err("STL meshが空です".to_owned());
    }

    Ok(MeshData {
        positions,
        normals,
        texcoords: None,
        indices,
    })
}

fn parse_obj_mesh(content: &str) -> Result<MeshData, String> {
    let mut source_positions = Vec::new();
    let mut source_normals = Vec::new();
    let mut source_texcoords = Vec::new();
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut texcoords = Vec::new();
    let mut uses_texcoords = false;
    let mut indices = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let parts = trimmed.split_whitespace().collect::<Vec<_>>();

        match parts.as_slice() {
            ["v", x, y, z, ..] => source_positions.push([
                parse_f32(x, "OBJ vertex")?,
                parse_f32(y, "OBJ vertex")?,
                parse_f32(z, "OBJ vertex")?,
            ]),
            ["vn", x, y, z, ..] => source_normals.push(normalize3([
                parse_f32(x, "OBJ normal")?,
                parse_f32(y, "OBJ normal")?,
                parse_f32(z, "OBJ normal")?,
            ])),
            ["vt", u, v, ..] => source_texcoords.push([
                parse_f32(u, "OBJ texcoord")?,
                1.0 - parse_f32(v, "OBJ texcoord")?,
            ]),
            ["f", vertices @ ..] if vertices.len() >= 3 => {
                let face = vertices
                    .iter()
                    .map(|token| {
                        parse_obj_face_vertex(
                            token,
                            &source_positions,
                            &source_texcoords,
                            &source_normals,
                        )
                    })
                    .collect::<Result<Vec<_>, _>>()?;

                for index in 1..face.len() - 1 {
                    let triangle = [&face[0], &face[index], &face[index + 1]];
                    let face_normal = compute_normal(
                        triangle[0].position,
                        triangle[1].position,
                        triangle[2].position,
                    );

                    for vertex in triangle {
                        positions.push(vertex.position);
                        normals.push(vertex.normal.unwrap_or(face_normal));
                        texcoords.push(vertex.texcoord.unwrap_or([0.0, 0.0]));
                        uses_texcoords |= vertex.texcoord.is_some();
                        indices.push(indices.len() as u32);
                    }
                }
            }
            _ => {}
        }
    }

    if positions.is_empty() {
        return Err("OBJ meshが空です".to_owned());
    }

    Ok(MeshData {
        positions,
        normals,
        texcoords: uses_texcoords.then_some(texcoords),
        indices,
    })
}

#[derive(Debug, Clone)]
struct ObjFaceVertex {
    position: [f32; 3],
    texcoord: Option<[f32; 2]>,
    normal: Option<[f32; 3]>,
}

fn parse_obj_face_vertex(
    token: &str,
    positions: &[[f32; 3]],
    texcoords: &[[f32; 2]],
    normals: &[[f32; 3]],
) -> Result<ObjFaceVertex, String> {
    let mut parts = token.split('/');
    let position = resolve_obj_index(parts.next().unwrap_or_default(), positions.len())?;
    let texcoord = parts
        .next()
        .filter(|part| !part.is_empty())
        .map(|part| resolve_obj_index(part, texcoords.len()))
        .transpose()?;
    let normal = parts
        .next()
        .filter(|part| !part.is_empty())
        .map(|part| resolve_obj_index(part, normals.len()))
        .transpose()?;

    Ok(ObjFaceVertex {
        position: *positions
            .get(position)
            .ok_or_else(|| "OBJ position indexが範囲外です".to_owned())?,
        texcoord: texcoord.and_then(|index| texcoords.get(index).copied()),
        normal: normal.and_then(|index| normals.get(index).copied()),
    })
}

fn resolve_obj_index(value: &str, len: usize) -> Result<usize, String> {
    let index = value
        .parse::<isize>()
        .map_err(|_| "OBJ face indexを読み込めません".to_owned())?;

    if index > 0 {
        return Ok((index - 1) as usize);
    }

    if index < 0 {
        return Ok((len as isize + index) as usize);
    }

    Err("OBJ face index 0 は無効です".to_owned())
}

fn parse_f32(value: &str, label: &str) -> Result<f32, String> {
    let number = value
        .parse::<f32>()
        .map_err(|_| format!("{label}を数値として読み込めません"))?;

    number
        .is_finite()
        .then_some(number)
        .ok_or_else(|| format!("{label}が有限値ではありません"))
}

fn apply_model_transform(mesh: &mut MeshData, options: &ModelConvertOptions) {
    for position in &mut mesh.positions {
        *position = transform_axis(*position, options.up);
        position[0] *= options.scale;
        position[1] *= options.scale;
        position[2] *= options.scale;
    }
    for normal in &mut mesh.normals {
        *normal = normalize3(transform_axis(*normal, options.up));
    }

    if options.center {
        let (min, max) = position_bounds(&mesh.positions);
        let center = [
            (min[0] + max[0]) * 0.5,
            (min[1] + max[1]) * 0.5,
            (min[2] + max[2]) * 0.5,
        ];

        for position in &mut mesh.positions {
            position[0] -= center[0];
            position[1] -= center[1];
            position[2] -= center[2];
        }
    }
}

fn transform_axis(value: [f32; 3], up: ModelUpAxis) -> [f32; 3] {
    let [x, y, z] = value;

    match up {
        ModelUpAxis::Auto | ModelUpAxis::Z => [x, y, z],
        ModelUpAxis::NegativeZ => [x, -y, -z],
        ModelUpAxis::Y => [x, -z, y],
        ModelUpAxis::NegativeY => [x, z, -y],
        ModelUpAxis::X => [-z, y, x],
        ModelUpAxis::NegativeX => [z, y, -x],
    }
}

fn compute_normal(a: [f32; 3], b: [f32; 3], c: [f32; 3]) -> [f32; 3] {
    normalize3(cross3(sub3(b, a), sub3(c, a)))
}

fn sub3(left: [f32; 3], right: [f32; 3]) -> [f32; 3] {
    [left[0] - right[0], left[1] - right[1], left[2] - right[2]]
}

fn cross3(left: [f32; 3], right: [f32; 3]) -> [f32; 3] {
    [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ]
}

fn normalize3(value: [f32; 3]) -> [f32; 3] {
    let length = (value[0] * value[0] + value[1] * value[1] + value[2] * value[2]).sqrt();

    if length <= f32::EPSILON {
        return [0.0, 0.0, 1.0];
    }

    [value[0] / length, value[1] / length, value[2] / length]
}

fn position_bounds(positions: &[[f32; 3]]) -> ([f32; 3], [f32; 3]) {
    let mut min = [f32::INFINITY; 3];
    let mut max = [f32::NEG_INFINITY; 3];

    for position in positions {
        for axis in 0..3 {
            min[axis] = min[axis].min(position[axis]);
            max[axis] = max[axis].max(position[axis]);
        }
    }

    (min, max)
}

fn write_mesh_glb(
    destination_path: &Path,
    mesh: &MeshData,
    base_color: [f32; 4],
) -> Result<(), String> {
    if mesh.positions.is_empty() || mesh.indices.is_empty() {
        return Err("meshが空です".to_owned());
    }

    let mut bin = Vec::new();
    let indices_view = append_u32_buffer_view(&mut bin, &mesh.indices, 34963);
    let positions_view = append_vec3_buffer_view(&mut bin, &mesh.positions, 34962);
    let normals_view = append_vec3_buffer_view(&mut bin, &mesh.normals, 34962);
    let texcoords_view = mesh
        .texcoords
        .as_ref()
        .map(|texcoords| append_vec2_buffer_view(&mut bin, texcoords, 34962));
    let (min, max) = position_bounds(&mesh.positions);
    let mut buffer_views = vec![
        buffer_view_json(indices_view),
        buffer_view_json(positions_view),
        buffer_view_json(normals_view),
    ];
    let mut accessors = vec![
        json!({
            "bufferView": 0,
            "byteOffset": 0,
            "componentType": 5125,
            "count": mesh.indices.len(),
            "type": "SCALAR",
        }),
        json!({
            "bufferView": 1,
            "byteOffset": 0,
            "componentType": 5126,
            "count": mesh.positions.len(),
            "type": "VEC3",
            "min": min,
            "max": max,
        }),
        json!({
            "bufferView": 2,
            "byteOffset": 0,
            "componentType": 5126,
            "count": mesh.normals.len(),
            "type": "VEC3",
        }),
    ];
    let mut attributes = json!({
        "POSITION": 1,
        "NORMAL": 2,
    });

    if let Some(texcoords_view) = texcoords_view {
        let view_index = buffer_views.len();
        let accessor_index = accessors.len();
        buffer_views.push(buffer_view_json(texcoords_view));
        accessors.push(json!({
            "bufferView": view_index,
            "byteOffset": 0,
            "componentType": 5126,
            "count": mesh.positions.len(),
            "type": "VEC2",
        }));
        attributes["TEXCOORD_0"] = json!(accessor_index);
    }

    let mut document = json!({
        "asset": { "version": "2.0", "generator": "kMark" },
        "buffers": [{ "byteLength": bin.len() }],
        "bufferViews": buffer_views,
        "accessors": accessors,
        "materials": [{
            "pbrMetallicRoughness": {
                "baseColorFactor": base_color,
                "metallicFactor": 0.0,
                "roughnessFactor": 0.6
            }
        }],
        "meshes": [{
            "primitives": [{
                "attributes": attributes,
                "indices": 0,
                "material": 0,
                "mode": 4
            }]
        }],
        "nodes": [{ "mesh": 0 }],
        "scenes": [{ "nodes": [0] }],
        "scene": 0,
    });

    write_glb(destination_path, &mut document, &bin)
}

#[derive(Debug, Clone, Copy)]
struct BufferViewInfo {
    byte_offset: usize,
    byte_length: usize,
    target: u32,
}

fn append_u32_buffer_view(bin: &mut Vec<u8>, values: &[u32], target: u32) -> BufferViewInfo {
    align_bytes(bin, 4, 0);
    let byte_offset = bin.len();

    for value in values {
        bin.extend_from_slice(&value.to_le_bytes());
    }

    BufferViewInfo {
        byte_offset,
        byte_length: bin.len() - byte_offset,
        target,
    }
}

fn append_vec3_buffer_view(bin: &mut Vec<u8>, values: &[[f32; 3]], target: u32) -> BufferViewInfo {
    align_bytes(bin, 4, 0);
    let byte_offset = bin.len();

    for value in values {
        for component in value {
            bin.extend_from_slice(&component.to_le_bytes());
        }
    }

    BufferViewInfo {
        byte_offset,
        byte_length: bin.len() - byte_offset,
        target,
    }
}

fn append_vec2_buffer_view(bin: &mut Vec<u8>, values: &[[f32; 2]], target: u32) -> BufferViewInfo {
    align_bytes(bin, 4, 0);
    let byte_offset = bin.len();

    for value in values {
        for component in value {
            bin.extend_from_slice(&component.to_le_bytes());
        }
    }

    BufferViewInfo {
        byte_offset,
        byte_length: bin.len() - byte_offset,
        target,
    }
}

fn buffer_view_json(info: BufferViewInfo) -> Value {
    json!({
        "buffer": 0,
        "byteOffset": info.byte_offset,
        "byteLength": info.byte_length,
        "target": info.target,
    })
}

fn write_glb(destination_path: &Path, document: &mut Value, bin: &[u8]) -> Result<(), String> {
    document["buffers"] = json!([{ "byteLength": bin.len() }]);
    let mut json_chunk = serde_json::to_vec(document).map_err(|error| error.to_string())?;
    align_bytes(&mut json_chunk, 4, b' ');
    let mut bin_chunk = bin.to_vec();
    align_bytes(&mut bin_chunk, 4, 0);
    let total_len = 12 + 8 + json_chunk.len() + 8 + bin_chunk.len();
    let mut file = fs::File::create(destination_path).map_err(|error| error.to_string())?;

    file.write_all(b"glTF").map_err(|error| error.to_string())?;
    file.write_all(&2_u32.to_le_bytes())
        .map_err(|error| error.to_string())?;
    file.write_all(&(total_len as u32).to_le_bytes())
        .map_err(|error| error.to_string())?;
    file.write_all(&(json_chunk.len() as u32).to_le_bytes())
        .map_err(|error| error.to_string())?;
    file.write_all(b"JSON").map_err(|error| error.to_string())?;
    file.write_all(&json_chunk)
        .map_err(|error| error.to_string())?;
    file.write_all(&(bin_chunk.len() as u32).to_le_bytes())
        .map_err(|error| error.to_string())?;
    file.write_all(b"BIN\0")
        .map_err(|error| error.to_string())?;
    file.write_all(&bin_chunk)
        .map_err(|error| error.to_string())
}

fn align_bytes(bytes: &mut Vec<u8>, alignment: usize, pad: u8) {
    while bytes.len() % alignment != 0 {
        bytes.push(pad);
    }
}

fn collect_obj_related_paths(source_path: &Path) -> Vec<PathBuf> {
    let Ok(content) = fs::read_to_string(source_path) else {
        return Vec::new();
    };
    let source_directory = source_path.parent().unwrap_or_else(|| Path::new("."));
    let mut paths = Vec::new();
    let mut seen = HashSet::new();

    for line in content.lines() {
        let trimmed = line.trim();
        let Some(rest) = trimmed.strip_prefix("mtllib ") else {
            continue;
        };

        for mtl in rest.split_whitespace() {
            let mtl_path = source_directory.join(mtl);
            push_unique_existing_path(&mut paths, &mut seen, mtl_path.clone());
            for texture in collect_mtl_texture_paths(&mtl_path) {
                push_unique_existing_path(&mut paths, &mut seen, texture);
            }
        }
    }

    paths
}

fn collect_mtl_texture_paths(mtl_path: &Path) -> Vec<PathBuf> {
    let Ok(content) = fs::read_to_string(mtl_path) else {
        return Vec::new();
    };
    let mtl_directory = mtl_path.parent().unwrap_or_else(|| Path::new("."));
    let mut paths = Vec::new();

    for line in content.lines() {
        let parts = line.split_whitespace().collect::<Vec<_>>();
        let Some(keyword) = parts.first() else {
            continue;
        };

        if !matches!(
            *keyword,
            "map_Kd" | "map_Ks" | "map_Bump" | "bump" | "map_d" | "disp" | "decal"
        ) {
            continue;
        }

        if let Some(texture) = parts.last() {
            paths.push(mtl_directory.join(texture));
        }
    }

    paths
}

fn collect_gltf_related_paths(source_path: &Path) -> Vec<PathBuf> {
    let Ok(content) = fs::read_to_string(source_path) else {
        return Vec::new();
    };
    let Ok(document) = serde_json::from_str::<Value>(&content) else {
        return Vec::new();
    };
    let source_directory = source_path.parent().unwrap_or_else(|| Path::new("."));
    let mut paths = Vec::new();
    let mut seen = HashSet::new();

    for uri in document
        .get("buffers")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|buffer| buffer.get("uri").and_then(Value::as_str))
        .chain(
            document
                .get("images")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|image| image.get("uri").and_then(Value::as_str)),
        )
    {
        if uri.starts_with("data:") {
            continue;
        }
        let (path, _) = split_resource_path_and_suffix(uri);
        push_unique_existing_path(&mut paths, &mut seen, source_directory.join(path));
    }

    paths
}

fn collect_fbx_related_paths(source_path: &Path) -> Vec<PathBuf> {
    let Ok(bytes) = fs::read(source_path) else {
        return Vec::new();
    };
    let text = String::from_utf8_lossy(&bytes);
    let source_directory = source_path.parent().unwrap_or_else(|| Path::new("."));
    let mut paths = Vec::new();
    let mut seen = HashSet::new();

    for token in text.split(|character: char| {
        character.is_whitespace() || matches!(character, '"' | '\'' | '\0' | ',' | ';')
    }) {
        if is_texture_path_token(token) {
            push_unique_existing_path(&mut paths, &mut seen, source_directory.join(token));
        }
    }

    paths
}

fn is_texture_path_token(token: &str) -> bool {
    let extension = Path::new(token)
        .extension()
        .and_then(OsStr::to_str)
        .map(str::to_ascii_lowercase);

    matches!(
        extension.as_deref(),
        Some("png" | "jpg" | "jpeg" | "webp" | "bmp" | "tga" | "tif" | "tiff")
    )
}

fn push_unique_existing_path(paths: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>, path: PathBuf) {
    if path.is_file() && seen.insert(path.clone()) {
        paths.push(path);
    }
}

fn mime_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(OsStr::to_str)
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        _ => "image/png",
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::prepare_markdown_model_assets;

    #[test]
    fn converts_ascii_stl_next_to_markdown() {
        let sandbox = create_temp_test_directory();
        let markdown = sandbox.join("note.md");
        let stl = sandbox.join("case.stl");
        fs::write(&markdown, "# note").expect("write markdown");
        fs::write(
            &stl,
            "solid a\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid a\n",
        )
        .expect("write stl");

        let resolutions = prepare_markdown_model_assets(
            Some(markdown.to_string_lossy().as_ref()),
            "![](./case.stl)",
        );

        assert!(resolutions["./case.stl"].error.is_none());
        assert_eq!(
            resolutions["./case.stl"].display_destination_url.as_deref(),
            Some("case_converted.glb")
        );
        assert!(sandbox.join("case_converted.glb").is_file());
    }

    #[test]
    fn default_transform_preserves_z_as_vertical_axis() {
        let mut mesh = test_mesh_with_position_and_normal([1.0, 2.0, 3.0], [0.0, 0.0, 1.0]);
        let options = super::ModelConvertOptions {
            center: false,
            ..super::ModelConvertOptions::default()
        };

        super::apply_model_transform(&mut mesh, &options);

        assert_eq!(mesh.positions[0], [1.0, 2.0, 3.0]);
        assert_eq!(mesh.normals[0], [0.0, 0.0, 1.0]);
    }

    #[test]
    fn y_up_transform_maps_input_y_axis_to_output_z_axis() {
        let mut mesh = test_mesh_with_position_and_normal([0.0, 2.0, 0.0], [0.0, 1.0, 0.0]);
        let options = super::ModelConvertOptions {
            center: false,
            up: super::ModelUpAxis::Y,
            ..super::ModelConvertOptions::default()
        };

        super::apply_model_transform(&mut mesh, &options);

        assert_eq!(mesh.positions[0], [0.0, 0.0, 2.0]);
        assert_eq!(mesh.normals[0], [0.0, 0.0, 1.0]);
    }

    fn test_mesh_with_position_and_normal(position: [f32; 3], normal: [f32; 3]) -> super::MeshData {
        super::MeshData {
            positions: vec![position],
            normals: vec![normal],
            texcoords: None,
            indices: vec![0],
        }
    }

    fn create_temp_test_directory() -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("kmark-model-asset-test-{suffix}"));
        fs::create_dir_all(&directory).expect("create temp directory");
        directory
    }
}
