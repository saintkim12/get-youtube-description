<script setup lang="ts">
import 'bulma'
import { Ref, ref } from 'vue'
import { getFromBackground } from '/src/background'
import $ from 'jquery'
import flow from 'lodash/fp/flow'
import fileDownload from 'js-file-download'

const message = ref('popup page')

interface VideoItem {
  videoId: string,
  videoTitle: string,
  url: string,
  text: string,
}
const videoList: Ref<VideoItem[]> = ref([])

const addVideoItem = () => {
  videoList.value.push({
    videoId: '',
    videoTitle: '',
    url: '',
    text: '',
  })
}
const parsePage = async (item: VideoItem) => {
  const url = item.url
  if (!url) return
  const html = await fetch(url).then(r => r.text())
  const dom = $(html)
  // console.log('html', html)
  console.log('dom', dom)
  console.log('$', $)
  const target = flow(
    $html => $html.closest('script:contains("var ytInitialPlayerResponse")').html(),
    script => script.split(';var meta')[0],
    script => script.replace(/[\s]*var ytInitialPlayerResponse[\s]*=[\s]*/, ''),
    jsonStr => JSON.parse(jsonStr)
  )(dom)
  console.log('target', target)

  const videoId = target.videoDetails.videoId
  const videoTitle = target.videoDetails.title
  const md = [ 
    `# ${target.videoDetails.title}`,
    `${target.videoDetails.shortDescription}`,
  ].join('\n')
  item.videoId = videoId
  item.videoTitle = videoTitle
  item.text = md

  // fileDownload(md, `${target.videoDetails.title.slice(0, 20)}.md`)

  console.log('setStorage', JSON.parse(JSON.stringify(videoList.value)))
  await setStorage(JSON.parse(JSON.stringify(videoList.value)))
}
const parseCurrentPage = async (item: VideoItem) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  console.log('tab', tab)
  if (tab.url) {
    item.url = tab.url
    return parsePage(item)
  }
}
const downloadTextFile = async (item: VideoItem) => {
  fileDownload(item.text, `${item.videoTitle.slice(0, 20)}.md`)
}

const printText = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  console.log('tab', tab)
  if (tab.url) {
    const html = await fetch(tab.url).then(r => r.text())
    const dom = $(html)
    // console.log('html', html)
    console.log('dom', dom)
    console.log('$', $)
    const target = flow(
      $html => $html.closest('script:contains("var ytInitialPlayerResponse")').html(),
      script => script.split(';var meta')[0],
      script => script.replace(/[\s]*var ytInitialPlayerResponse[\s]*=[\s]*/, ''),
      jsonStr => JSON.parse(jsonStr)
    )(dom)
    console.log('target', target)

    const videoId = target.videoDetails.videoId
    const md = [ 
      `# ${target.videoDetails.title}`,
      `${target.videoDetails.shortDescription}`,
    ].join('\n')

    fileDownload(md, `${target.videoDetails.title.slice(0, 20)}.md`)

    // const el = root.querySelector('body > script')
    
    // console.log('el', el?.innerHTML)
  }
  message.value = `${tab.url ?? ''}`
}

/* onCreated */
;(async () => {
  const $videoList = await getStorage()
  console.log('$videoList', $videoList)
  videoList.value = [...(Array.isArray($videoList) ? $videoList : [])]
})()


/**
 * Chrome Extension Storage를 이용하여 특정 키 내부의 항목 조회
 */
function getStorage(key = 'videoList') {
  return chrome.storage.local.get([key]).then(({ [key]: value }) => {
    return value
  })
}
/**
 * Chrome Extension Storage를 이용하여 특정 키 내부의 항목 설정
 */
function setStorage(obj: any, key = 'videoList') {
  return chrome.storage.local.set({ [key]: obj })
}
/**
 * Chrome Extension Storage를 이용하여 특정 키 내부의 항목 초기화
 */
function clearStorage(key = 'videoList') {
  return chrome.storage.local.remove(key)
}
</script>

<template>
  <div :style="{ width: '401px' }">
    {{ message }}
    <button @click="printText">텍스트 내놔</button>
    <button @click="addVideoItem">항목추가</button>

    <div v-for="(item, idx) in videoList" :key="idx">
      <span>{{ idx + 1 }}</span>
      <input type="text" v-model="item.url" @change="parsePage(item)">
      <button type="button" @click="parseCurrentPage(item)">현재페이지</button>
      <button type="button" :disabled="!(item.text?.length > 0)" @click="downloadTextFile(item)">다운로드</button>
    </div>
  </div>
</template>