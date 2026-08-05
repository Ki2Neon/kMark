use std::collections::VecDeque;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AppExitAction {
    None,
    RequestWindow(String),
    Exit,
}

#[derive(Debug, Default)]
pub(crate) struct AppExitCoordinator {
    current_window_label: Option<String>,
    pending_window_labels: VecDeque<String>,
}

impl AppExitCoordinator {
    pub(crate) fn begin(
        &mut self,
        window_labels: impl IntoIterator<Item = String>,
    ) -> AppExitAction {
        if self.is_in_progress() {
            return AppExitAction::None;
        }

        let mut window_labels = window_labels.into_iter().collect::<Vec<_>>();
        window_labels.sort_unstable();
        window_labels.dedup();
        self.pending_window_labels = window_labels.into();

        self.advance()
    }

    pub(crate) fn complete_window(&mut self, window_label: &str) -> AppExitAction {
        if self.current_window_label.as_deref() != Some(window_label) {
            return AppExitAction::None;
        }

        self.current_window_label = None;
        self.advance()
    }

    pub(crate) fn cancel(&mut self, window_label: &str) -> bool {
        if self.current_window_label.as_deref() != Some(window_label) {
            return false;
        }

        self.current_window_label = None;
        self.pending_window_labels.clear();
        true
    }

    pub(crate) fn is_in_progress(&self) -> bool {
        self.current_window_label.is_some() || !self.pending_window_labels.is_empty()
    }

    fn advance(&mut self) -> AppExitAction {
        let Some(window_label) = self.pending_window_labels.pop_front() else {
            return AppExitAction::Exit;
        };

        self.current_window_label = Some(window_label.clone());
        AppExitAction::RequestWindow(window_label)
    }
}

#[cfg(test)]
mod tests {
    use super::{AppExitAction, AppExitCoordinator};

    #[test]
    fn requests_each_window_in_deterministic_order_then_exits() {
        let mut coordinator = AppExitCoordinator::default();

        assert_eq!(
            coordinator.begin([
                "tray-untitled-2".to_owned(),
                "main".to_owned(),
                "tray-untitled-1".to_owned(),
                "main".to_owned(),
            ]),
            AppExitAction::RequestWindow("main".to_owned())
        );
        assert_eq!(
            coordinator.complete_window("main"),
            AppExitAction::RequestWindow("tray-untitled-1".to_owned())
        );
        assert_eq!(
            coordinator.complete_window("tray-untitled-1"),
            AppExitAction::RequestWindow("tray-untitled-2".to_owned())
        );
        assert_eq!(
            coordinator.complete_window("tray-untitled-2"),
            AppExitAction::Exit
        );
    }

    #[test]
    fn ignores_duplicate_begin_and_stale_completion() {
        let mut coordinator = AppExitCoordinator::default();

        assert_eq!(
            coordinator.begin(["main".to_owned()]),
            AppExitAction::RequestWindow("main".to_owned())
        );
        assert_eq!(
            coordinator.begin(["tray-untitled-1".to_owned()]),
            AppExitAction::None
        );
        assert_eq!(
            coordinator.complete_window("tray-untitled-1"),
            AppExitAction::None
        );
        assert_eq!(coordinator.complete_window("main"), AppExitAction::Exit);
    }

    #[test]
    fn cancellation_resets_the_sequence() {
        let mut coordinator = AppExitCoordinator::default();

        assert_eq!(
            coordinator.begin(["main".to_owned(), "tray-untitled-1".to_owned()]),
            AppExitAction::RequestWindow("main".to_owned())
        );
        assert!(coordinator.cancel("main"));
        assert!(!coordinator.is_in_progress());
        assert_eq!(
            coordinator.begin(["tray-untitled-1".to_owned()]),
            AppExitAction::RequestWindow("tray-untitled-1".to_owned())
        );
    }

    #[test]
    fn exits_immediately_when_no_editor_window_exists() {
        let mut coordinator = AppExitCoordinator::default();

        assert_eq!(coordinator.begin([]), AppExitAction::Exit);
    }
}
