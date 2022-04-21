<script setup lang="ts">
import { computed, Ref, ref, nextTick } from 'vue'
import fileDownload from 'js-file-download'

const videoList: Ref<VideoItem[]> = ref([])
const videoListRef: Ref<HTMLDivElement | undefined> = ref()

const addVideoItem = () => {
  videoList.value.push({
    videoId: '',
    videoTitle: '',
    url: '',
    description: '',
    filename: '',
  })
  nextTick(() => {
    console.log('videoListRef.value', videoListRef.value)
    if (videoListRef.value) {
      videoListRef.value.scrollTo({ top: videoListRef.value.scrollHeight })
    }
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
const removeItem = async (item: VideoItem, idx: number) => {
  const deleteIdx = idx
  videoList.value = videoList.value.filter(($0, _idx) => _idx !== deleteIdx)
  return await setStorage(JSON.parse(JSON.stringify(videoList.value)))
}
const removeAllItems = () => {
  return withLoader(async () => {
    videoList.value = []
    return await setStorage(JSON.parse(JSON.stringify(videoList.value)))
  })
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

function downloadOneVideoDescription(item: VideoItem) {
  return new Promise((resolve) => {
    runInBackground({ cmd: 'parseDescription', args: [{ item, template: descriptionTemplate.value || undefined }] }, (message, port) => {
      // console.log('App.vue::message', message)
      const { result, videoItem }: { result: boolean, videoItem: VideoItemWithText } = message
      if (result === true) {
        fileDownload(videoItem.textToFile, videoItem.filename)
        port.disconnect()
        resolve(result)
      }
      return true
    })
  })
}

function downloadAllVideoDescription() {
  return withLoader(new Promise((resolve) => {
    runInBackground({ cmd: 'zip', args: [{ template: descriptionTemplate.value || undefined }] }, (message, port) => {
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
  }))
}
function getFromPlayList() {
  return withLoader(new Promise((resolve) => {
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
  }))
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
function initDescriptionTemplateSample() {
  return new Promise((resolve) => {
    runInBackground({ cmd: 'getDescriptionTemplateSample' }, (message, port) => {
      if (message?.result === true) {
        descriptionTemplate.value = message.template
        port.disconnect()
        resolve(message.result)
      }
      return true
    })
  })
}
function initCanGetFromPlayList() {
  return new Promise((resolve) => {
    runInBackground({ cmd: 'canGetFromPlayList' }, (message, port) => {
      if (message?.result === true) {
        canGetFromPlayList.value = (<string[]> message.videoIds).length > 0
        port.disconnect()
        resolve(message.result)
      }
      return true
    })
  })
}

/**************************
 * test
 **************************/
const tabs = ref([
  { id: 'getDescriptions', title: 'Get Descriptions' },
  { id: 'descriptionTemplate', title: 'Description Template' },
  { id: 'settings', title: 'Settings' },
])
const tabId = ref(tabs.value[0]?.id)
const activeTab = computed(() => tabs.value.find(({ id }) => id === tabId.value))
const descriptionTemplate = ref('')
const isAppLoading = ref(false)
const withLoader = async (fn: Promise<any> | (() => any)) => {
  isAppLoading.value = true
  try {
    if (typeof fn === 'function')
      return await fn()
    else {
      return await fn
    }
  } finally {
    isAppLoading.value = false
  }
}
const canGetFromPlayList = ref(false)

/**************************
 * test
 **************************/

/* onCreated */
;(() => {
  withLoader(async () => {
    const $videoList = await getStorage()
    console.log('$videoList', $videoList)
    videoList.value = [...(Array.isArray($videoList) ? $videoList : [])]

    await initDescriptionTemplateSample()

    await initCanGetFromPlayList().catch(() => {})
  })
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
  <div :style="{ width: '651px', height: '600px' }">
    <nav class="panel">
      <div class="panel-block p-0 is-block">
        <div class="tabs is-small is-fullwidth">
          <ul>
            <li
              v-for="({ id, title }) in tabs"
              :key="id"
              :class="[id === tabId && 'is-active']"
            >
              <a @click="tabId = id">{{ title }}</a>
            </li>
          </ul>
        </div>
      </div>
      <div class="panel-block is-block" :style="{ height: 'calc(600px - 32px)', position: 'relative' }">
        <template v-if="false"></template>
        <template v-else-if="tabId === 'getDescriptions'">
          <div class="is-flex is-fullwidth is-justify-content-space-between">
            <div class="is-flex">
              <h3 class="subtitle">{{ activeTab?.title }}</h3>
            </div>
            <div class="is-flex">
              <button class="button is-small ml-1" title="전체다운로드" @click="downloadAllVideoDescription">
                <i class="icon mdi mdi-18px mdi-download-multiple"></i>
              </button>
              <button class="button is-small ml-1" title="항목추가" @click="addVideoItem">
                <i class="icon mdi mdi-18px mdi-plus-circle"></i>
              </button>
              <button class="button is-small ml-1" title="전체삭제" @click="removeAllItems">
                <i class="icon mdi mdi-18px mdi-trash-can"></i>
              </button>
              <button class="button is-small ml-1" title="플레이리스트추가" :disabled="!canGetFromPlayList" @click="getFromPlayList">
                <i class="icon mdi mdi-18px mdi-music-note-plus"></i>
              </button>
            </div>
          </div>
          <div ref="videoListRef" class="is-block mt-1" :style="{ height: 'calc(100% - 30px - 0.25rem)', overflow: 'auto' }">
            <template v-if="videoList.length > 0">
              <template v-for="(item, idx) in videoList" :key="idx">
                <div class="card pt-2">
                  <div class="card-content p-1">
                    <div class="media mb-2">
                      <div class="media-content is-clipped">
                        <div class="is-flex is-justify-content-space-between">
                          <div class="field has-addons has-addons-right mb-0" :style="{ width: 'calc(100% - 132px)' }">
                            <p class="control">
                              <input class="input is-small is-static" type="text" readonly :value="`#${idx + 1}`" :style="{ width: '36px' }">
                            </p>
                            <p class="control is-expanded">
                              <input class="input is-small" type="text" placeholder="filename" v-model="item.filename" :readonly="!(item.description?.length > 0)">
                            </p>
                            <p class="control">
                              <span class="select is-small">
                                <select>
                                  <option>md</option>
                                  <option>txt</option>
                                </select>
                              </span>
                            </p>
                          </div>
                          <div>
                            <button class="button is-small ml-1" title="현재페이지" @click.prevent="parseCurrentPage(item)"><i class="icon mdi mdi-18px mdi-book-arrow-right-outline"></i></button>
                            <button class="button is-small ml-1" title="다운로드" :disabled="!(item.description?.length > 0)" @click.prevent="downloadOneVideoDescription(item)"><i class="icon mdi mdi-18px mdi-download"></i></button>
                            <button class="button is-small ml-1" title="삭제" @click.prevent="removeItem(item, idx)"><i class="icon mdi mdi-18px mdi-close"></i></button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <!-- <div v-show="false" class="content mb-2"> -->
                    <div class="content mb-2">
                      <div class="control has-icons-left has-icons-right">
                        <input class="input is-small" type="text" v-model="item.url" @change="parsePage(item)">
                        <span class="icon is-small is-left">
                          <i class="mdi mdi-web"></i>
                        </span>
                        <span class="icon is-small is-right">
                          <i class="mdi mdi-check"></i>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <hr class="py-0 my-0">
              </template>
            </template>
            <template v-else>
              <div class="card pt-2">
                <div class="card-content p-1" :style="{ position: 'relative', height: '80px' }">
                  <div class="is-flex is-align-items-center is-justify-content-center" :style="{ position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, color: '#aaa', border: '1px dotted #ddd', borderRadius: '2px', }">
                    항목추가(<i class="icon mdi mdi-18px mdi-plus-circle"></i>) 버튼을 눌러 항목을 추가할 수 있습니다.
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>
        <template v-else-if="tabId === 'descriptionTemplate'">
          <div class="is-flex is-fullwidth is-justify-content-space-between">
            <div class="is-flex">
              <h3 class="subtitle">{{ activeTab?.title }}</h3>
            </div>
            <div class="is-flex">
              <button class="button is-small ml-1" title="초기화" @click="initDescriptionTemplateSample"><i class="icon mdi mdi-18px mdi-cached"></i></button>
              <button class="button is-small ml-1" title="저장"><i class="icon mdi mdi-18px mdi-content-save"></i></button>
            </div>
          </div>
          <div class="is-block mt-1" :style="{ height: 'calc(100% - 30px - 0.25rem)', overflow: 'auto' }">
            <textarea
              class="textarea has-fixed-size"
              v-model="descriptionTemplate"
              :style="{ height: 'calc(100% - 0.25rem)' }"
            ></textarea>
          </div>
        </template>
        <template v-else-if="tabId === 'settings'">
          <div class="is-flex is-fullwidth is-justify-content-space-between">
            <div class="is-flex">
              <h3 class="subtitle">{{ activeTab?.title }}</h3>
            </div>
            <div class="is-flex">
              <!-- <button class="button is-small ml-1" title="초기화"><i class="icon mdi mdi-18px mdi-cached"></i></button> -->
              <!-- <button class="button is-small ml-1" title="저장"><i class="icon mdi mdi-18px mdi-content-save"></i></button> -->
            </div>
          </div>
          <div class="is-block mt-1" :style="{ height: 'calc(100% - 30px - 0.25rem)', overflow: 'auto' }">
          </div>
        </template>
        <template v-else>
          {{ tabId }}
        </template>
        <div
          v-if="isAppLoading"
          class="is-flex is-justify-content-center is-align-items-center"
          :style="{ position: 'absolute', opacity: '0.8', backgroundColor: 'white', top: 0, left: 0, bottom: 0, right: 0, }"
        >
          <div class="loader is-loading" :style="{ width: '80px', height: '80px' }"></div>
        </div>
      </div>
    </nav>
  </div>
</template>
