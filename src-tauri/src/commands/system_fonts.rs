use std::{collections::HashSet, env, fs, path::PathBuf};

#[tauri::command]
pub fn list_system_font_families() -> Vec<String> {
    let mut font_families = HashSet::new();

    for font_directory in system_font_directories() {
        collect_font_families_from_directory(&font_directory, &mut font_families);
    }

    let mut font_families = font_families.into_iter().collect::<Vec<_>>();
    font_families.sort_by_key(|font_family| font_family.to_lowercase());
    font_families
}

fn system_font_directories() -> Vec<PathBuf> {
    let mut directories = Vec::new();

    if cfg!(target_os = "windows") {
        if let Some(windir) = env::var_os("WINDIR") {
            directories.push(PathBuf::from(windir).join("Fonts"));
        }
        if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
            directories.push(PathBuf::from(local_app_data).join("Microsoft").join("Windows").join("Fonts"));
        }
    }

    directories
}

fn collect_font_families_from_directory(directory: &PathBuf, font_families: &mut HashSet<String>) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase());

        if !matches!(extension.as_deref(), Some("ttf" | "otf" | "ttc")) {
            continue;
        }

        let Ok(bytes) = fs::read(&path) else {
            continue;
        };

        collect_font_families_from_bytes(&bytes, font_families);
    }
}

fn collect_font_families_from_bytes(bytes: &[u8], font_families: &mut HashSet<String>) {
    if bytes.get(0..4) == Some(b"ttcf") {
        let Some(font_count) = read_u32(bytes, 8) else {
            return;
        };

        for index in 0..font_count.min(256) as usize {
            let Some(offset) = read_u32(bytes, 12 + index * 4) else {
                continue;
            };
            collect_font_families_from_sfnt(bytes, offset as usize, font_families);
        }
        return;
    }

    collect_font_families_from_sfnt(bytes, 0, font_families);
}

fn collect_font_families_from_sfnt(bytes: &[u8], sfnt_offset: usize, font_families: &mut HashSet<String>) {
    let Some(table_count) = read_u16(bytes, sfnt_offset + 4) else {
        return;
    };

    for table_index in 0..table_count as usize {
        let record_offset = sfnt_offset + 12 + table_index * 16;

        if bytes.get(record_offset..record_offset + 4) != Some(b"name") {
            continue;
        }

        let Some(name_table_offset) = read_u32(bytes, record_offset + 8) else {
            return;
        };
        collect_font_families_from_name_table(bytes, name_table_offset as usize, font_families);
        return;
    }
}

fn collect_font_families_from_name_table(bytes: &[u8], table_offset: usize, font_families: &mut HashSet<String>) {
    let Some(record_count) = read_u16(bytes, table_offset + 2) else {
        return;
    };
    let Some(string_offset) = read_u16(bytes, table_offset + 4) else {
        return;
    };
    let storage_offset = table_offset + string_offset as usize;

    for preferred_name_id in [16_u16, 1_u16] {
        let mut found = false;

        for record_index in 0..record_count as usize {
            let record_offset = table_offset + 6 + record_index * 12;
            let Some(platform_id) = read_u16(bytes, record_offset) else {
                continue;
            };
            let Some(name_id) = read_u16(bytes, record_offset + 6) else {
                continue;
            };

            if name_id != preferred_name_id {
                continue;
            }

            let Some(length) = read_u16(bytes, record_offset + 8) else {
                continue;
            };
            let Some(offset) = read_u16(bytes, record_offset + 10) else {
                continue;
            };
            let start = storage_offset + offset as usize;
            let end = start + length as usize;
            let Some(raw_name) = bytes.get(start..end) else {
                continue;
            };
            let Some(font_family) = decode_font_name(platform_id, raw_name).and_then(normalize_font_family) else {
                continue;
            };

            font_families.insert(font_family);
            found = true;
        }

        if found {
            return;
        }
    }
}

fn decode_font_name(platform_id: u16, bytes: &[u8]) -> Option<String> {
    if platform_id == 0 || platform_id == 3 {
        let units = bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        return String::from_utf16(&units).ok();
    }

    std::str::from_utf8(bytes).ok().map(ToOwned::to_owned)
}

fn normalize_font_family(value: String) -> Option<String> {
    let font_family = value.trim();

    (!font_family.is_empty()
        && !font_family.chars().any(|character| {
            character.is_control() || matches!(character, '\\' | ';' | '{' | '}' | '<' | '>')
        }))
    .then(|| font_family.to_owned())
}

fn read_u16(bytes: &[u8], offset: usize) -> Option<u16> {
    let bytes = bytes.get(offset..offset + 2)?;
    Some(u16::from_be_bytes([bytes[0], bytes[1]]))
}

fn read_u32(bytes: &[u8], offset: usize) -> Option<u32> {
    let bytes = bytes.get(offset..offset + 4)?;
    Some(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

#[cfg(test)]
mod tests {
    use super::list_system_font_families;

    #[test]
    fn lists_system_font_families_without_panicking() {
        let font_families = list_system_font_families();

        for font_family in font_families {
            assert!(!font_family.trim().is_empty());
        }
    }
}
