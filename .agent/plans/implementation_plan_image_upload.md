# Implementation Plan: Image Upload and Handling in Chat

To enable users to paste or upload images in the chat, we need to implement a robust frontend handler that processes images before sending them to the backend.

## 1. Frontend: Image Handling UI & Logic

### 1.1 Update `ChatComponent` (`chat.component.ts`)

-   **State**:
    -   `pendingAttachments`: Signal<File[]> to store images ready to be sent.
    -   `canSendMessage`: Computed signal to allow sending if text OR attachments exist.
-   **Methods**:
    -   `onPaste(event: ClipboardEvent)`: Detect image data in clipboard, convert to File, add to `pendingAttachments`.
    -   `onFileSelected(event: Event)`: Handle file input selection.
    -   `removeAttachment(index: number)`: Remove an image from the pending list.
    -   `sendMessage()`:
        -   Convert images to Base64.
        -   Update payload to include `images` array (Base64 strings or structured objects).
        -   Clear `pendingAttachments` after sending.

### 1.2 Update HTML (`chat.component.html`)

-   **Input Area**:
    -   Add `(paste)="onPaste($event)"` to the input field or a wrapping container.
    -   Add a "Paperclip" icon button for file selection (hidden file input).
-   **Preview Area**:
    -   Display thumbnails of `pendingAttachments` _above_ the input field.
    -   specialized "pill" or "card" design for preview with "X" to remove.
-   **Message Dislay**:
    -   Update `chat loop` to render images if present in the message history.

### 1.3 Service Update (`agent.service.ts` or inline in Component)

-   **Helper**: `fileToBase64(file: File): Promise<string>`

## 2. Backend: Image Processing Support

### 2.1 API Update (`api/agent/chat`)

-   **Controller**: Update `chat` method to accept `images` in the request body.
-   **Gemini Module**:
    -   Update `chatWithAgent` to handle multi-modal input.
    -   Gemini API supports inline data for images. We need to construct the `parts` array correctly:
        ```javascript
        const parts = [
        	{ text: message },
        	...images.map((img) => ({
        		inlineData: {
        			mimeType: "image/jpeg",
        			data: img.base64, // Remove header if needed
        		},
        	})),
        ];
        ```

### 2.2 Persistence

-   **Repository**: Needs to store image data (or references) in the conversation JSON.
    -   _Warning_: Storing Base64 in JSON files will bloat them rapidly.
    -   _Better approach_: Save images to `data/uploads/` and store filenames in `messages`.
    -   _Simplification for now_: We'll store Base64 to keep it self-contained, but note the scalability limit. Or just transiently send to Gemini and not persist valid history? (User wants memory).
    -   _Decision_: We will save images to disk `backend/data/uploads/<id>.png` and reference them in the JSON as `image_url: "/api/uploads/<id>.png"`.

### 2.3 New Static Route

-   Serve `backend/data/uploads` at `/api/uploads`.

## Estimated Effort

-   **Frontend**: ~1 hour (Paste logic, preview UI, base64 conversion).
-   **Backend**: ~1 hour (Image saving, Gemini multi-modal integration).
