# Direct PDF editing and visual navigation

The native PDF document now opens the shared editor immediately. Reading mode remains available for files whose editing runtime is not ready. Fixed-page editing retains the source PDF geometry; a separate, explicitly confirmed “문서로 편집” action imports selectable text into the regular document editor for paragraph editing. This import is not a layout reconstruction and the confirmation explains the effect.

Page navigation lazily renders thumbnails near the viewport. Revision changes refresh thumbnails without replacing existing previews with blank cards. Object rows use T for text and rendered page-region previews for shapes/images. Text hit targets take priority over page-sized backgrounds. Double-clicking text opens an on-page input with Enter/blur to apply and Escape to cancel.

Validation uses optional local multipage fixtures, never checked into the repository. The document UI regression exercises thumbnails, object previews, overlapping hit targets, inline Korean editing, transforms, deletion/undo, copy saving, document import dispatch, and unchanged source hashes. The native lifecycle test requires immediate editing mode and checks deferred close during an edit. Existing worker and GUI checks remain applicable.

Continuation: eight resize handles transform the real PDF object while preserving the opposite anchor. Shift locks the visual aspect ratio; page rotation swaps scale axes and maps center movement into PDF coordinates. Escape cancels without a revision. Handles sit outside the object so small text stays clickable. Context menus expose text/image editing, rotation and deletion. Page number, previous/next and Page Up/Down navigate without thumbnail scrolling; page/width zoom modes track workspace size.
