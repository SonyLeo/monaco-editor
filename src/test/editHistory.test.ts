/**
 * 编辑历史收集测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as monaco from 'monaco-editor';
import { NESController } from '../core/engines/NESController';

describe('EditHistory Collection', () => {
  let editor: monaco.editor.IStandaloneCodeEditor;
  let controller: NESController;

  beforeEach(() => {
    // 创建测试编辑器
    const container = document.createElement('div');
    editor = monaco.editor.create(container, {
      value: 'function test() {\n  console.log("hello");\n}',
      language: 'typescript'
    });

    controller = new NESController(editor);
  });

  it('should collect edit history on content change', async () => {
    const model = editor.getModel();
    if (!model) throw new Error('Model not found');

    // 模拟用户编辑：将 test 改为 test123
    model.applyEdits([{
      range: new monaco.Range(1, 10, 1, 14),
      text: 'test123'
    }]);

    // 等待一下让编辑历史被记录
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证编辑历史被收集（通过私有属性访问，仅用于测试）
    const history = (controller as any).editHistory;
    expect(history).toBeDefined();
    expect(history.length).toBeGreaterThan(0);
    
    const lastEdit = history[history.length - 1];
    expect(lastEdit.type).toBe('replace');
    expect(lastEdit.oldText).toBe('test');
    expect(lastEdit.newText).toBe('test123');
  });

  it('should limit history size to MAX_HISTORY_SIZE', async () => {
    const model = editor.getModel();
    if (!model) throw new Error('Model not found');

    // 模拟 15 次编辑
    for (let i = 0; i < 15; i++) {
      model.applyEdits([{
        range: new monaco.Range(2, 3, 2, 3),
        text: 'x'
      }]);
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const history = (controller as any).editHistory;
    expect(history.length).toBeLessThanOrEqual(10); // MAX_HISTORY_SIZE = 10
  });

  it('should detect insert type correctly', async () => {
    const model = editor.getModel();
    if (!model) throw new Error('Model not found');

    // 插入新文本
    model.applyEdits([{
      range: new monaco.Range(2, 3, 2, 3),
      text: 'NEW'
    }]);

    await new Promise(resolve => setTimeout(resolve, 100));

    const history = (controller as any).editHistory;
    const lastEdit = history[history.length - 1];
    expect(lastEdit.type).toBe('insert');
  });

  it('should detect delete type correctly', async () => {
    const model = editor.getModel();
    if (!model) throw new Error('Model not found');

    // 删除文本
    model.applyEdits([{
      range: new monaco.Range(2, 3, 2, 10),
      text: ''
    }]);

    await new Promise(resolve => setTimeout(resolve, 100));

    const history = (controller as any).editHistory;
    const lastEdit = history[history.length - 1];
    expect(lastEdit.type).toBe('delete');
  });
});
