<script setup lang="ts">
/**
 * Vue 3 示例应用
 * 展示 AI Code Assistant 的完整使用方式
 */
import { ref } from 'vue';
import AICodeAssistantEditor from './AICodeAssistantEditor.vue';

const code = ref(`// Welcome to AI Code Assistant Demo
// This is a Vue 3 integration example

function createUser(name: string) {
  console.log("Creating user:", name);
  return { name };
}

// Try editing the function above to add a parameter
// Then see NES suggestions appear!

const user1 = createUser("Alice");
const user2 = createUser("Bob");
`);

const statusMessage = ref('Ready');

function handleReady() {
    statusMessage.value = '✅ Editor ready with AI assistance';
}
</script>

<template>
    <div class="app">
        <header class="header">
            <h1>🤖 AI Code Assistant - Vue 3 Demo</h1>
            <span class="status">{{ statusMessage }}</span>
        </header>

        <main class="main">
            <AICodeAssistantEditor
                v-model="code"
                language="typescript"
                theme="vs-dark"
                @ready="handleReady"
            />
        </main>

        <footer class="footer">
            <div class="shortcuts">
                <span>
                    <kbd>Tab</kbd>
                    Preview/Accept
                </span>
                <span>
                    <kbd>Alt+N</kbd>
                    Skip
                </span>
                <span>
                    <kbd>Esc</kbd>
                    Close
                </span>
            </div>
        </footer>
    </div>
</template>

<style>
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1e1e1e;
    color: #d4d4d4;
    height: 100vh;
    overflow: hidden;
}

#app {
    height: 100vh;
}
</style>

<style scoped>
.app {
    display: flex;
    flex-direction: column;
    height: 100vh;
}

.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.header h1 {
    font-size: 1.25rem;
    font-weight: 600;
    color: white;
}

.status {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.9);
}

.main {
    flex: 1;
    overflow: hidden;
}

.footer {
    padding: 10px 20px;
    background: #252526;
    border-top: 1px solid #3e3e3e;
}

.shortcuts {
    display: flex;
    gap: 24px;
    font-size: 13px;
    color: #888;
}

.shortcuts kbd {
    background: #3e3e3e;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    margin-right: 4px;
}
</style>
