import React, { useEffect, useRef, useState } from 'react';
import {
  useAction,
  useRecords,
  workbench,
  formatDate,
  type NotePayload,
  type RecordItem,
} from '../../sdk';
import { optimizeImageFile, validateImageCount } from '../../ui/media/imageOptimizer';
import { copyTextToClipboard } from '../../ui/export/exportUtils';
import { Button } from '../../ui/primitives/Button';
import { Dialog } from '../../ui/primitives/Dialog';
import { Input, Textarea } from '../../ui/primitives/Input';
import { Icon } from '../../ui/icons/Icon';

function NoteImage({ id }: { id: string }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void workbench.assets
      .get(id)
      .then((asset) => {
        if (active) setUrl(asset.url);
      })
      .catch(() => {
        if (active) setError('图片加载失败');
      });
    return () => {
      active = false;
    };
  }, [id]);
  return error ? (
    <span role="alert">{error}</span>
  ) : url ? (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="笔记图片附件" loading="lazy" />
    </a>
  ) : (
    <span className="micro">加载图片...</span>
  );
}

export const QuickNotes: React.FC = () => {
  const { data: notes, loading, error: loadError } = useRecords<NotePayload>('notes');
  const action = useAction();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecordItem<NotePayload> | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [pinned, setPinned] = useState(false);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const temporaryIds = useRef(new Set<string>());
  const pendingWork = useRef<Promise<unknown>>(Promise.resolve());
  const cleanup = async () => {
    await pendingWork.current;
    for (const id of temporaryIds.current) {
      await workbench.assets.delete(id);
      temporaryIds.current.delete(id);
    }
  };
  useEffect(() => {
    const ids = temporaryIds.current;
    return () => {
      void (async () => {
        await pendingWork.current;
        for (const id of ids) {
          await workbench.assets.delete(id);
          ids.delete(id);
        }
      })().catch(console.error);
    };
  }, []);
  const reset = () => {
    setTitle('');
    setContent('');
    setTags('');
    setPinned(false);
    setAssetIds([]);
    setEditing(null);
  };
  const discard = () => {
    if (!action.pending)
      void action.run(async () => {
        await cleanup();
        reset();
        setOpen(false);
      });
  };
  const upload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    const promise = action.run(async () => {
      validateImageCount(assetIds.length, files.length);
      let count = assetIds.length;
      for (const file of files) {
        const image = await optimizeImageFile(file, count++);
        const asset = await workbench.assets.import(image.bytes);
        temporaryIds.current.add(asset.id);
        setAssetIds((old) => [...old, asset.id]);
      }
    });
    pendingWork.current = promise;
  };
  const save = () => {
    const promise = action.run(async () => {
      if (!title.trim() && !content.trim()) throw new Error('请输入笔记标题或正文');
      const data = {
        payload: { title: title.trim() || '速记灵感', content: content.trim(), pinned },
        tags: tags.split(/[,，\s]+/).filter(Boolean),
        businessDate: editing?.businessDate || formatDate(new Date()),
        archived: editing?.archived ?? false,
        assetIds,
      };
      if (editing) await workbench.records.update(editing.id, data, editing.updatedAt);
      else await workbench.records.create('notes', data);
      temporaryIds.current.clear();
      reset();
      setOpen(false);
    });
    pendingWork.current = promise;
  };
  const edit = (note: RecordItem<NotePayload>) => {
    setEditing(note);
    setTitle(note.payload.title);
    setContent(note.payload.content);
    setPinned(Boolean(note.payload.pinned));
    setTags((note.tags || []).join(' '));
    setAssetIds(note.assetIds || []);
    setOpen(true);
  };
  const filtered = notes
    .filter((note) =>
      [note.payload.title, note.payload.content, ...(note.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(Boolean(b.payload.pinned)) - Number(Boolean(a.payload.pinned)) ||
        b.updatedAt - a.updatedAt,
    );
  return (
    <section id="module-notes" className="module-container panel notes-panel">
      <header className="panel-head">
        <div className="panel-heading">
          <span className="panel-index">06</span>
          <div>
            <h3 className="panel-title">
              <Icon name="fa-feather-pointed" />
              速记与灵感
            </h3>
            <p className="panel-sub">置顶优先 · 按更新时间倒序</p>
          </div>
        </div>
        <div className="panel-actions">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            <Icon name="fa-plus" />
            记录灵感
          </Button>
        </div>
      </header>
      {(loadError || action.error) && <p role="alert">{loadError?.message || action.error}</p>}

      <div className="search-field">
        <Icon name="fa-magnifying-glass" />
        <Input
          aria-label="搜索速记"
          placeholder="搜索速记..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {loading ? (
        <div className="empty-state">
          <Icon name="fa-circle-notch" />
          正在加载笔记...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Icon name="fa-feather" />
          暂无速记内容
        </div>
      ) : (
        <div className="notes-grid">
          {filtered.map((note) => (
            <article
              key={note.id}
              className={'note-card' + (note.payload.pinned ? ' is-pinned' : '')}
            >
              <h4>
                {note.payload.pinned && <Icon name="fa-thumbtack" title="已置顶" />}
                {note.payload.title}
              </h4>
              <p className="note-content" tabIndex={0}>
                {note.payload.content}
              </p>
              <div className="note-images">
                {note.assetIds?.map((id) => (
                  <NoteImage key={id} id={id} />
                ))}
              </div>
              {note.tags && note.tags.length > 0 && (
                <small className="note-tags">{note.tags.join(' · ')}</small>
              )}
              <div className="module-actions note-actions">
                <Button size="sm" variant="ghost" onClick={() => edit(note)} title="编辑">
                  <Icon name="fa-pen" />
                  编辑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title="复制"
                  onClick={() =>
                    void action.run(() =>
                      copyTextToClipboard(note.payload.title + '\n\n' + note.payload.content),
                    )
                  }
                >
                  <Icon name="fa-copy" />
                  复制
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  title="删除"
                  onClick={() =>
                    void action.run(() => workbench.records.delete(note.id, note.updatedAt))
                  }
                >
                  <Icon name="fa-trash-can" />
                  删除
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={discard}
        title={editing ? '编辑速记' : '记录新灵感 / 速记'}
        description={editing ? '修改后保存将覆盖原记录' : '支持标签与本地图片附件'}
        footer={
          <>
            <Button disabled={action.pending} onClick={discard}>
              取消
            </Button>
            <Button disabled={action.pending} variant="primary" onClick={save}>
              保存速记
            </Button>
          </>
        }
      >
        {action.error && <p role="alert">{action.error}</p>}
        <div className="note-form">
          <div className="form-field">
            <label>笔记标题</label>
            <Input
              aria-label="笔记标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label>正文内容</label>
            <Textarea
              aria-label="正文内容"
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label>标签</label>
            <Input
              aria-label="标签"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </div>
          <label className="check-line">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(event) => setPinned(event.target.checked)}
            />
            置顶显示
          </label>
          <div className="form-field">
            <label>本地图片附件（{assetIds.length}/9）</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              disabled={action.pending || assetIds.length >= 9}
              onChange={upload}
            />
          </div>
          <div className="note-images">
            {assetIds.map((id) => (
              <div key={id}>
                <NoteImage id={id} />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.pending}
                  onClick={() =>
                    void action.run(async () => {
                      if (temporaryIds.current.has(id)) {
                        await workbench.assets.delete(id);
                        temporaryIds.current.delete(id);
                      }
                      setAssetIds((old) => old.filter((item) => item !== id));
                    })
                  }
                >
                  移除附件
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Dialog>
    </section>
  );
};
