use std::sync::{Arc, Mutex};

use kmark_application::{ApplicationEvent, ApplicationEventSink};

type EventCallback = dyn Fn(&ApplicationEvent) + Send + Sync;

#[derive(Default)]
pub(crate) struct DeferredApplicationEventSink {
    callback: Mutex<Option<Arc<EventCallback>>>,
}

impl DeferredApplicationEventSink {
    pub(crate) fn set_callback(&self, callback: Arc<EventCallback>) {
        *self
            .callback
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(callback);
    }
}

impl ApplicationEventSink for DeferredApplicationEventSink {
    fn publish(&self, event: &ApplicationEvent) {
        let callback = self
            .callback
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();
        if let Some(callback) = callback {
            callback(event);
        }
    }
}
