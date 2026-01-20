<script setup lang="ts">
import NesEditor from './components/NesEditor.vue';
</script>

<template>
    <NesEditor />
</template>

<style>
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu,
        sans-serif;
}

#app {
    height: 100vh;
    overflow: hidden;
}
</style>
