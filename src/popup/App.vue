<script setup lang="ts">
import { Ref, ref } from 'vue'
import fileDownload from 'js-file-download'

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
const parseCurrentPage = async (item: VideoItem) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  console.log('tab', tab)
  if (tab.url) {
    item.url = tab.url
    return parsePage(item)
  }
}
const downloadOneVideoDescription = async (item: VideoItem) => {
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

/***************************
 * cmds                    *
 ***************************/
function runInBackground(cmd: MessageCmd, ...listeners: ((message: any, port: chrome.runtime.Port) => void)[]) {
  const port = chrome.runtime.connect({ name: 'background' })
  port.postMessage(cmd)
  listeners.forEach(lst => {
    port.onMessage.addListener(lst)
  })
  return port
}
function downloadAllVideoDescription() {
  return new Promise((resolve) => {
    runInBackground({ cmd: 'zip' }, (message, port) => {
      // console.log('App.vue::message', message)
      const { result, videoIds: $videoIds }: { result: boolean, videoIds: string[] } = message
      if (result === true) {
        ;(async() => {
          const v = await getStorage()
          videoList.value = [...v]
          port.disconnect()
          resolve(result)
        })()
      }
      return true
    })
  })
}
function getFromPlayList() {
  return new Promise((resolve) => {
    runInBackground({ cmd: 'getFromPlayList' }, (message: { result: boolean, ended: boolean, videoList: VideoItem[] }, port) => {
      // console.log('getFromPlayList', 'result', message)
      if (!message.result) return
      // console.log('ended', message.ended)
      // unref(updateVideoListUnWatcherRef)?.()
      if (!message.ended) {
        // updateVideoListUnWatcherRef.value = debounce(500)(async () => {
        //   videoList.value = [...(await getStorage())]
        // })
        videoList.value = [...message.videoList]
      }
      if (message.ended) {
        // unref(updateVideoListUnWatcherRef)?.()
        videoList.value = [...message.videoList]
        port.disconnect()
        resolve(message.result)
      }
      return true
    })
  })
}
function parsePage(item: VideoItem) {
  return new Promise((resolve) => {
    runInBackground({ cmd: 'parsePage', args: [item] }, (message, port) => {
      if (message?.result === true) {
        const videoItem = message.videoList[0]
        Object.assign(item, videoItem)
        // console.log('setStorage', JSON.parse(JSON.stringify(videoList.value)))
        ;(async() => {
          await setStorage(JSON.parse(JSON.stringify(videoList.value)))
          port.disconnect()
          resolve(message.result)
        })()
      }
      return true
    })
  })
}

/**************************
 * test
 **************************/
/**************************
 * test
 **************************/

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
  <div class="container is-fluid px-0" :style="{ width: '651px' }">
    <div class="box is-flex">
      <button class="button is-small" @click="downloadAllVideoDescription">다운로드</button>
      <button class="button is-small" @click="addVideoItem">+</button>
      <button class="button is-small" @click="removeAllItems">-</button>
      <button class="button is-small" @click="getFromPlayList">플레이리스트</button>
      
    </div>
    <br>
    <div class="box table-container">
      <table class="table is-striped is-fullwidth is-narrow">
        <thead>
          <tr>
            <th>#</th>
            <th>파일명</th>
            <th>URL</th>
            <th>{..}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, idx) in videoList" :key="idx">
            <td>{{ idx + 1 }}</td>
            <td><input type="text" class="input is-small" v-model="item.filename" :readonly="!(item.text?.length > 0)"></td>
            <td><input type="text" class="input is-small" v-model="item.url" @change="parsePage(item)"></td>
            <td>
              <a class="tag is-clickable" @click.prevent="parseCurrentPage(item)">현재페이지</a>
              <a class="tag is-clickable" :disabled="!(item.text?.length > 0)" @click.prevent="downloadOneVideoDescription(item)">다운로드</a>
              <a class="tag is-delete" @click.prevent="removeItem(item, idx)"></a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
