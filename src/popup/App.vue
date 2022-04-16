<script setup lang="ts">
import { Ref, ref } from 'vue'
import { getFromBackground } from '/src/background'
import $ from 'jquery'
import flow from 'lodash/fp/flow'

import fileDownload from 'js-file-download'
import JSZip from 'jszip'

const message = ref('popup page')

const videoList: Ref<VideoItem[]> = ref([])

const addVideoItem = () => {
  videoList.value.push({
    videoId: '',
    videoTitle: '',
    url: '',
    text: '',
    filename: '',
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
  item.filename = `${item.videoTitle.slice(0, 255)}.md`
  // item.filename = `${item.videoTitle.slice(0, 20)}.md`

  // fileDownload(md, `${target.videoDetails.title.slice(0, 20)}.md`)

  console.log('setStorage', JSON.parse(JSON.stringify(videoList.value)))
  return await setStorage(JSON.parse(JSON.stringify(videoList.value)))
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
  fileDownload(item.text, item.filename)
}
const removeItem = async (item: VideoItem, idx: number) => {
  const deleteIdx = idx
  videoList.value = videoList.value.filter(($0, _idx) => _idx !== deleteIdx)
  return await setStorage(JSON.parse(JSON.stringify(videoList.value)))
}
const removeAllItems = async () => {
  videoList.value = []
  return await setStorage(JSON.parse(JSON.stringify(videoList.value)))
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

    fileDownload(md, target.filename)

    // const el = root.querySelector('body > script')
    
    // console.log('el', el?.innerHTML)
  }
  message.value = `${tab.url ?? ''}`
}

const downloadAll = async function() {
  const zip = new JSZip()
  videoList.value.filter((item) => item.text?.length > 0).map((item, idx) => {
    // zip.file(`${new String(idx).padStart(3, '0')}_${item.videoTitle.slice(0, 20)}.md`, item.text)
    zip.file(item.filename, item.text)
  })
  const content = await zip.generateAsync({ type: 'blob', platform: 'UNIX' })
  fileDownload(content, `${Date.now()}.zip`)
}
const downloadAllByBackground = async function() {
  chrome.runtime.sendMessage('zip', (result) => {
    console.log('responseCallback', result)
    if (result?.result === true) {
      const videoIds = <string[]> result?.videoIds ?? []
      // 다운받은 비디오는 항목에서 삭제
      videoList.value = videoList.value.filter((item) => !videoIds.includes(item.videoId))
      
      console.log('setStorage', JSON.parse(JSON.stringify(videoList.value)))
      return setStorage(JSON.parse(JSON.stringify(videoList.value)))
    }
  })
}

const getFromPlaylistByBackground = async function() {
  chrome.runtime.sendMessage('getFromPlaylist', (result) => {
    console.log('getFromPlaylist', 'result', result)
    // if (result?.resultType === 'init' && result?.result === true) {
    //   const $videoList = await getStorage()
    //   console.log('init ended', $videoList)
    //   videoList.value = [...(Array.isArray($videoList) ? $videoList : [])]
    // } else if (result?.resultType === 'load' && result?.result === true) {
    //   const $videoList = await getStorage()
    //   console.log('load ended', $videoList)
    //   videoList.value = [...(Array.isArray($videoList) ? $videoList : [])]
    // }
    if (result?.result === true) {
      getStorage().then($videoList => {
        console.log('init ended', $videoList)
        videoList.value = [...(Array.isArray($videoList) ? $videoList : [])]
      })
    }
  })
}
const getFromPlaylist = async function() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [],
    func: () => {
      const elList = document.querySelector('ytd-playlist-panel-renderer:not([hidden])')?.querySelectorAll?.('#items > ytd-playlist-panel-video-renderer > a') ?? []
      const result = [...Array.from(elList.length ? elList : [])].map(el => (<HTMLAnchorElement> el).href)
      console.log('result in tab', result)
      return result
    }
  }).then(([result]) => <string[]> result?.result ?? [])

  console.log('result', result)

  videoList.value = videoList.value.concat(result.map(url => (<VideoItem> { videoId: '', videoTitle: '', url, text: '' })))
  
  return Promise.all(
    videoList.value.map(item => parsePage(item))
  )
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
  <div :style="{ width: '651px' }">
    {{ message }}

    <!-- <button @click="printText">텍스트 내놔</button> -->
    <button @click="downloadAllByBackground">downloadAllByBackground</button>
    <button @click="downloadAll">전체다운로드</button>
    <button @click="removeAllItems">전체삭제</button>
    <button @click="addVideoItem">항목추가</button>
    <button @click="getFromPlaylist">getFromPlaylist</button>
    <button @click="getFromPlaylistByBackground">getFromPlaylistByBackground</button>

    <div v-for="(item, idx) in videoList" :key="idx">
      <span>{{ idx + 1 }}</span>
      <label>파일명<input type="text" v-model="item.filename" :readonly="!(item.text?.length > 0)"></label>
      <label>URL<input type="text" v-model="item.url" @change="parsePage(item)"></label>
      <button type="button" @click="parseCurrentPage(item)">현재페이지</button>
      <button type="button" :disabled="!(item.text?.length > 0)" @click="downloadTextFile(item)">다운로드</button>
      <button type="button" @click="removeItem(item, idx)">삭제</button>
    </div>
  </div>
</template>
