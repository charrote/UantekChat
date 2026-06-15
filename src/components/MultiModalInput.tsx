import React, { useState, useRef, ChangeEvent, DragEvent, ClipboardEvent, KeyboardEvent } from 'react';

interface Attachment {
  id: string;
  file: File;
  previewUrl: string;
  type: 'image' | 'file';
  base64?: string;
}

interface KbStatus {
  available: boolean;
  docCount: number;
  lastSync: string | null;
}

interface MultiModalInputProps {
  onSendMessage: (content: string, attachments?: Attachment[]) => void;
  isLoading: boolean;
  ragEnabled?: boolean;
  onToggleRag?: () => void;
  kbStatus?: KbStatus;
}

const MultiModalInput: React.FC<MultiModalInputProps> = ({ onSendMessage, isLoading, ragEnabled = false, onToggleRag, kbStatus }) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (e) => reject(e);
    });
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      handleFiles(Array.from(files));
    }
  };

  const handleFiles = (files: File[]) => {
    const newAttachments: Attachment[] = files.map(file => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      type: file.type.startsWith('image/') ? 'image' : 'file'
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const filtered = prev.filter(a => a.id !== id);
      const toCleanup = prev.filter(a => a.id !== id && a.type === 'image');
      toCleanup.forEach(a => URL.revokeObjectURL(a.previewUrl));
      return filtered;
    });
  };

  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          setAttachments(prev => [...prev, {
            id: Math.random().toString(36).substring(2, 9),
            file,
            previewUrl: URL.createObjectURL(file),
            type: 'image'
          }]);
        }
      }
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() && attachments.length === 0) return;
    let finalAttachments = [...attachments];
    for (let i = 0; i < finalAttachments.length; i++) {
      if (finalAttachments[i].type === 'image' && !finalAttachments[i].base64) {
        finalAttachments[i].base64 = await toBase64(finalAttachments[i].file);
      }
    }
    onSendMessage(input, finalAttachments);
    setInput('');
    setAttachments([]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="input-area" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onPaste={handlePaste}>
      {attachments.length > 0 && (
        <div className="attachment-preview-bar">
          {attachments.map(attach => (
            <div key={attach.id} className="attachment-card">
              {attach.type === 'image' ? (
                <img src={attach.previewUrl} alt="preview" className="attachment-preview" />
              ) : (
                <div className="attachment-file-icon">📄</div>
              )}
              <button type="button" onClick={() => removeAttachment(attach.id)} className="attachment-remove">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="rag-controls">
        <button
          type="button"
          className={`rag-toggle-btn ${ragEnabled ? 'active' : ''}`}
          onClick={onToggleRag}
          title={ragEnabled ? '关闭知识库检索' : '开启知识库检索'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
            <path d="M11 8v6"/>
            <path d="M8 11h6"/>
          </svg>
          知识库
        </button>
        {kbStatus && (
          <span className={`kb-status ${kbStatus.available ? 'available' : 'unavailable'}`}>
            <span className="kb-status-dot"></span>
            {kbStatus.available ? `${kbStatus.docCount} 文档` : '未连接'}
          </span>
        )}
      </div>
      <div className={`input-wrapper ${isDragging ? 'dragging' : ''}`}>
        <button type="button" className="upload-btn" title="上传附件" onClick={() => fileInputRef.current?.click()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder={attachments.length > 0 ? '描述这些附件...' : '输入消息...'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          onInput={e => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = Math.min(target.scrollHeight, 200) + 'px';
          }}
        />
        <button type="button" className="send-btn" onClick={handleSendMessage} disabled={isLoading}>
          {isLoading ? <span className="send-spinner" /> : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
              发送
              <span className="send-shortcut">Ctrl+Enter</span>
            </>
          )}
        </button>
        <input type="file" ref={fileInputRef} multiple hidden onChange={handleFileChange} accept="image/*" />
      </div>
    </div>
  );
};

export default MultiModalInput;
