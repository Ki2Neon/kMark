use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

use crate::domain::is_supported_markdown_path;

pub fn collect_markdown_file_paths<I, T>(args: I, current_dir: &Path) -> Vec<PathBuf>
where
    I: IntoIterator<Item = T>,
    T: Into<OsString>,
{
    args.into_iter()
        .skip(1)
        .filter_map(|value| normalize_candidate_path(value.into(), current_dir))
        .filter(|path| path.is_file() && is_supported_markdown_path(path))
        .collect()
}

fn normalize_candidate_path(value: OsString, current_dir: &Path) -> Option<PathBuf> {
    if value.is_empty() {
        return None;
    }

    let candidate_path = PathBuf::from(value);

    if candidate_path.is_absolute() {
        return Some(candidate_path);
    }

    Some(current_dir.join(candidate_path))
}

#[cfg(test)]
mod tests {
    use std::{
        ffi::OsString,
        fs,
        hint::black_box,
        path::PathBuf,
        time::{Instant, SystemTime, UNIX_EPOCH},
    };

    use super::collect_markdown_file_paths;

    fn create_temp_directory(label: &str) -> PathBuf {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let directory_path = std::env::temp_dir().join(format!(
            "kmark-{}-{}-{}",
            label,
            std::process::id(),
            unique_suffix
        ));

        fs::create_dir_all(&directory_path).expect("failed to create temp directory");

        directory_path
    }

    #[test]
    fn collects_supported_markdown_files_in_argument_order() {
        let temp_directory = create_temp_directory("collect-paths-order");
        let relative_markdown_path = temp_directory.join("note.md");
        let absolute_markdown_path = temp_directory.join("memo.txt");
        let ignored_source_path = temp_directory.join("main.rs");

        fs::write(&relative_markdown_path, "# note")
            .expect("failed to write relative markdown file");
        fs::write(&absolute_markdown_path, "memo").expect("failed to write absolute markdown file");
        fs::write(&ignored_source_path, "fn main() {}")
            .expect("failed to write ignored source file");

        let file_paths = collect_markdown_file_paths(
            [
                OsString::from("kmark.exe"),
                OsString::from("note.md"),
                absolute_markdown_path.clone().into_os_string(),
                OsString::from("main.rs"),
                OsString::from("missing.md"),
            ],
            &temp_directory,
        );

        assert_eq!(
            file_paths,
            vec![
                relative_markdown_path.clone(),
                absolute_markdown_path.clone()
            ]
        );

        fs::remove_dir_all(temp_directory).expect("failed to clean temp directory");
    }

    #[test]
    fn ignores_empty_arguments_and_directories() {
        let temp_directory = create_temp_directory("collect-paths-filtering");
        let nested_directory = temp_directory.join("nested");
        let markdown_file_path = temp_directory.join("todo.markdown");

        fs::create_dir_all(&nested_directory).expect("failed to create nested directory");
        fs::write(&markdown_file_path, "- item").expect("failed to write markdown file");

        let file_paths = collect_markdown_file_paths(
            [
                OsString::from("kmark.exe"),
                OsString::new(),
                nested_directory.into_os_string(),
                OsString::from("todo.markdown"),
            ],
            &temp_directory,
        );

        assert_eq!(file_paths, vec![markdown_file_path.clone()]);

        fs::remove_dir_all(temp_directory).expect("failed to clean temp directory");
    }

    #[test]
    #[ignore = "benchmark"]
    fn benchmark_collect_markdown_file_paths() {
        let temp_directory = create_temp_directory("collect-paths-benchmark");
        let file_count = 1024usize;
        let iteration_count = 200usize;
        let mut args = Vec::with_capacity(file_count + 1);

        args.push(OsString::from("kmark.exe"));

        for index in 0..file_count {
            let file_name = format!("bench-{:04}.md", index);
            let file_path = temp_directory.join(&file_name);

            fs::write(&file_path, format!("# {index}"))
                .expect("failed to write benchmark markdown file");
            args.push(file_name.into());
        }

        let started_at = Instant::now();

        for _ in 0..iteration_count {
            black_box(collect_markdown_file_paths(args.clone(), &temp_directory));
        }

        let elapsed = started_at.elapsed();
        let average_micros = elapsed.as_micros() / iteration_count as u128;

        eprintln!(
            "benchmark_collect_markdown_file_paths file_count={} iteration_count={} total_ms={} avg_us={}",
            file_count,
            iteration_count,
            elapsed.as_millis(),
            average_micros,
        );

        fs::remove_dir_all(temp_directory).expect("failed to clean temp directory");
    }
}
