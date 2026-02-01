/// <reference types="vite/client" />
import { createApp } from 'vue';
import App from './App.vue';

// 配置 Monaco Editor Worker
// 在 Vite 环境下需要显式配置 worker 加载方式

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';

import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';

import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

(self as unknown as { MonacoEnvironment: object }).MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') {
      return new jsonWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

createApp(App).mount('#app');
