<script setup lang="ts">
import { ref } from 'vue'
import { getFromBackground } from '/src/background'

const message = ref('popup page')

const printText = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  console.log('tab', tab)
  if (tab.url) {
    const html = await fetch(tab.url).then(r => r.text())
    // const root = parse(html)
    // const el = root.querySelector('body > script')
    
    // console.log('el', el?.innerHTML)
  }
  message.value = `${tab.url ?? ''}`
}
</script>

<template>
  <div :style="{ width: '401px' }">
    {{ message }}
    <button @click="printText">텍스트 내놔</button>
  </div>
</template>