import JSZip from 'jszip'
import debounce from 'lodash/fp/debounce'
import cond from 'lodash/fp/cond'
import flow from 'lodash/fp/flow'
import { Ref, ref, unref, watch } from 'vue'
import sanitizeFilename from 'sanitize-filename'

const DESCRIPTION_TEMPLATE_SAMPLE = [
  '# ${videoTitle}',
  '',
  '${description}',
  '',
  'Video URL: ${url}',
].join('\n')

const videoList: Ref<VideoItem[]> = ref([])
const settings: Ref<{
  defaultExtension: string,
  clearAfterDownload: boolean,
  [key: string]: any
}> = ref({
  defaultExtension: 'md',
  clearAfterDownload: false,
})
const appStorage = {
  videoList,
  settings,
}
/* onCreated */
;(async () => {
  const $videoList = (await getStorage('videoList'))?.videoList
  // console.log('$videoList', $videoList)
  videoList.value = [...(Array.isArray($videoList) ? $videoList : [])]
  
  watch(videoList, debounce(500)(async () => {
    await setStorage({ 'videoList': JSON.parse(JSON.stringify(unref(appStorage.videoList))) })
    // console.log('setStorage(videoList)', (await getStorage('videoList'))?.videoList?.length ?? 0)
  }), { deep: true })
  
  const $settings = (await getStorage('settings'))?.settings
  Object.assign(settings.value, $settings)
  
  watch(settings, debounce(500)(async () => {
    await setStorage({ 'settings': JSON.parse(JSON.stringify(unref(appStorage.settings))) })
    console.log('setStorage(settings)', (await getStorage('settings'))?.settings)
  }), { deep: true })
})()


function updateItem(item: VideoItem, updateIdx: number) {
  // console.log('updateItem', updateIdx, item)
  appStorage.videoList.value = appStorage.videoList.value.map(($item, $idx) => $idx === updateIdx ? ({ ...item }) : $item)
}

async function parsePage(item: VideoItem, option?: any) {
  const url = item.url
  if (!url) return item
  const html = await fetch(url).then(r => r.text())
  const target = flow(
    $html => $html.slice($html.indexOf('var ytInitialPlayerResponse')),
    $html => $html.slice(0, $html.indexOf(';var meta')),
    script => script.replace(/[\s]*var ytInitialPlayerResponse[\s]*=[\s]*/, ''),
    jsonStr => JSON.parse(jsonStr)
  )(html)
  // console.log('target', target)

  const videoId = target.videoDetails.videoId
  const videoTitle = target.videoDetails.title
  // const md = [
  //   `# ${target.videoDetails.title}`,
  //   `${target.videoDetails.shortDescription}`,
  // ].join('\n')
  item.videoId = videoId
  item.videoTitle = videoTitle
  // item.text = md
  item.description = target.videoDetails.shortDescription
  // item.filename = `${item.videoTitle.replace(/\/\\/gi, ',').slice(0, 255)}.md`
  item.filename = sanitizeFilename(`${item.videoTitle}.${option?.extension ?? unref(settings).defaultExtension}`)
  // item.filename = `${item.videoTitle.slice(0, 20)}.md`

  // fileDownload(md, `${target.videoDetails.title.slice(0, 20)}.md`)

  // console.log('setStorage', JSON.parse(JSON.stringify(videoList)))
  // return await setStorage(JSON.parse(JSON.stringify(videoList)))
  return item
}
async function downloadFileWithTab({ url, filename }: { url: string, filename: string }) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    const e = new Error('No active tab.')
    throw e
  }
  return chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [{ url, filename }],
    func: ({ url, filename }) => {
      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = url
      a.setAttribute('download', filename)
      document.body.append(a)
      a.click()
      window.setTimeout(() => document.body.removeChild(a), 200)
    }
  })
}

function parseItemWithDescription(item: VideoItem, template?: string): VideoItemWithText {
  const getTextByTemplate = (item: VideoItem, template: string) => template
    .replace(/\$\{videoTitle\}/g, item.videoTitle)
    .replace(/\$\{description\}/g, item.description)
    .replace(/\$\{url\}/g, item.url)
  return ({ ...item, textToFile: getTextByTemplate(item, template ?? DESCRIPTION_TEMPLATE_SAMPLE) })
}

chrome.runtime.onConnect.addListener((port) => {
  cond<chrome.runtime.Port, void>([
    [(p) => p?.name === 'background', (port) => {
      port.onMessage.addListener((message, port) => {
        console.log(`background.ts::${port.name}.onMessage`, message)
        flow(
          (m) => typeof m === 'string' ? <MessageCmd> ({ cmd: m }) : <MessageCmd> m,
          cond<MessageCmd, Promise<any>>([
            [({ cmd }) => cmd === 'getStorageData', async (message) => {
              const keys: string[] = message.args ?? []
              const results = await getStorage(...keys)
              port.postMessage({ ...results })
            }],
            [({ cmd }) => cmd === 'setStorageData', async (message) => {
              const data: { [key: string]: any } = message.args?.[0]
              await setStorage(data)
              console.log('setStorage', data, (await getStorage(...Object.keys(data))))

              port.postMessage({ result: true })
            }],
            [({ cmd }) => cmd === 'addItem', async (message) => {
              const item: VideoItem | undefined = message.args?.[0]?.item
              
              appStorage.videoList.value.push({
                videoId: '',
                videoTitle: '',
                url: '',
                description: '',
                filename: '',
                ...item,
              })

              port.postMessage({ result: true, videoList: unref(appStorage.videoList) })
            }],
            [({ cmd }) => cmd === 'updateItem', async (message) => {
              const item: VideoItem = message.args?.[0]?.item
              const updateIdx: number = message.args?.[0]?.idx
              updateItem(item, updateIdx)

              port.postMessage({ result: true, videoList: unref(appStorage.videoList) })
            }],
            [({ cmd }) => cmd === 'removeItem', async (message) => {
              const deleteIdx: number = message.args?.[0]?.idx
              appStorage.videoList.value = appStorage.videoList.value.filter(($0, $idx) => $idx !== deleteIdx)

              port.postMessage({ result: true, videoList: unref(appStorage.videoList) })
            }],
            [({ cmd }) => cmd === 'removeAllItems', async (message) => {
              appStorage.videoList.value = []

              port.postMessage({ result: true, videoList: unref(appStorage.videoList) })
            }],
            [({ cmd }) => cmd === 'getDescriptionTemplateSample', async (message) => {
              port.postMessage({ result: true, template: DESCRIPTION_TEMPLATE_SAMPLE })
            }],
            [({ cmd }) => cmd === 'updateSettings', async (message) => {
              const option: object = message.args?.[0]
              Object.assign(appStorage.settings.value, option)

              port.postMessage({ result: true, settings: unref(appStorage.settings) })
            }],
            [({ cmd }) => cmd === 'zip', async (message) => {
              const option: { template?: string, clearAfterDownload?: boolean } = { ...message?.args?.[0] }
              // const videoList: VideoItem[] = await getStorage()
              const videoList: VideoItem[] = unref(appStorage.videoList)
              
              const zip = new JSZip()
              const descriptionParsedVideoList: VideoItemWithText[] = videoList.map((item) => parseItemWithDescription(item, option.template))
              const downloadVideoIdList: string[] = descriptionParsedVideoList.filter((item) => item.textToFile?.length > 0).map((item, idx) => {
                // zip.file(`${new String(idx).padStart(3, '0')}_${item.videoTitle.slice(0, 20)}.md`, item.text)
                zip.file(sanitizeFilename(item.filename), item.textToFile)
                return item.videoId
              })
    
              const content = await zip.generateAsync({ type: 'base64', platform: 'UNIX' })
              // fileDownload(content, 'test.zip')
              const url = `data:application/zip;base64,${content}`
              const filename = `${Date.now()}.zip`
              
              // console.log('url', url)
              // console.log({
              //   url,
              //   filename: `${Date.now()}.zip`
              // })

              try {
                /* ???????????? - ???????????? ????????? ?????? ??????????????? ????????? ????????? ?????? api ?????? ???????????? ?????? ?????? ?????? */
                await downloadFileWithTab({ url, filename })
              } catch (e) {
                /* ???????????? ????????? ??????????????? api ?????? ?????? - ???????????? ??? ??????????????? ???????????? ????????? ??????????????? ???????????? ???????????? */
                await chrome.downloads.download({ url, filename })
              }

              if (option.clearAfterDownload ?? unref(settings).clearAfterDownload) {
                // ???????????? ???????????? ???????????? ??????
                const videoIds = downloadVideoIdList
                appStorage.videoList.value = unref(appStorage.videoList).filter((item: VideoItem) => !videoIds.includes(item.videoId))
              }
              // console.log('background.ts::appStorage.videoList', unref(appStorage.videoList))

              port.postMessage({ result: true, url, videoIds: downloadVideoIdList, videoList: unref(appStorage.videoList) })
            }],
            [({ cmd }) => cmd === 'parseDescription', async (message) => {
              const option: { item: VideoItem, template?: string } = { ...message?.args?.[0] }
              const parsedItem = { ...parseItemWithDescription(option.item, option.template), filename: sanitizeFilename(option.item.filename) }
              
              port.postMessage({ result: true, videoItem: parsedItem })
            }],
            [({ cmd }) => cmd === 'parsePage', async (message) => {
              const args = message.args ?? []
              const orgVideoList = args.map(({ item, idx, ...o }) => ({ item: <VideoItem> item, idx, option: o?.option }))
              const parserVideoList = await Promise.allSettled(
                orgVideoList.map(({ item, idx, option }) => parsePage(item, option).then((item) => ({ item, idx })))
              )
              const videoList = parserVideoList.map((result, i) => (<PromiseFulfilledResult<{ item: VideoItem, idx: number }>> result)?.value ?? orgVideoList[i])
              // storage ??? ????????????
              videoList.forEach(({ item, idx }) => updateItem(item, idx))
              port.postMessage({ result: true, videoList: videoList })
            }],
            [({ cmd }) => cmd === 'canGetFromPlayList', async () => {
              const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
              if (!tab?.id) return
              const videoIds = (!tab?.id || !/http(|s):\/\//.test(tab?.url ?? '')) ? [] : await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                args: [],
                func: () => {
                  const elList = document.querySelector('ytd-playlist-panel-renderer:not([hidden])')?.querySelectorAll?.('#items > ytd-playlist-panel-video-renderer > a') ?? []
                  const result = [...Array.from(elList.length ? elList : [])].map(el => (<HTMLAnchorElement> el).href)
                  // console.log('result in tab', result)
                  return result
                }
              }).then(([result]) => <string[]> result?.result ?? [])
              
              port.postMessage({ result: true, videoIds })
            }],
            [({ cmd }) => cmd === 'getFromPlayList', async () => {
              const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
              if (!tab?.id) return
              const result = (!tab?.id || !/http(|s):\/\//.test(tab?.url ?? '')) ? [] : await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                args: [],
                func: () => {
                  const elList = document.querySelector('ytd-playlist-panel-renderer:not([hidden])')?.querySelectorAll?.('#items > ytd-playlist-panel-video-renderer > a') ?? []
                  const result = [...Array.from(elList.length ? elList : [])].map(el => (<HTMLAnchorElement> el).href)
                  // console.log('result in tab', result)
                  return result
                }
              }).then(([result]) => <string[]> result?.result ?? [])
            
              console.log('result', result)
    
              const $orgVideoList: VideoItem[] = unref(appStorage.videoList)
              const $newVideoList: VideoItem[] = result.map(url => (<VideoItem> { videoId: '', videoTitle: '', url, description: '', filename: '' }))
              
              videoList.value = videoList.value.concat($orgVideoList).concat($newVideoList)
    
              port.postMessage({ result: true, ended: false, videoList: videoList.value })
              
              const parserVideoList = await Promise.allSettled(videoList.value.map(
                (item, idx) => ((idx >= $orgVideoList.length) ? parsePage(item) : Promise.resolve(item))))
              appStorage.videoList.value = parserVideoList.map((result, i) => (<PromiseFulfilledResult<VideoItem>> result)?.value ?? videoList.value[i])
              
              port.postMessage({ result: true, ended: true, videoList: unref(appStorage.videoList) })
            }]
          ])
        )(message)
        return true
      })
    }],
  ])(port)
  return true
})


/**
 * Chrome Extension Storage??? ???????????? ?????? ??? ????????? ?????? ??????
 */
 function getStorage(...keys: string[]) {
  return chrome.storage.local.get(keys).then((obj: { [key: string]: any }) => {
    return obj
  })
}
/**
 * Chrome Extension Storage??? ???????????? ?????? ??? ????????? ?????? ??????
 */
function setStorage(data: { [key: string]: any }) {
  return chrome.storage.local.set({ ...data })
}
/**
 * Chrome Extension Storage??? ???????????? ?????? ??? ????????? ?????? ?????????
 */
function clearStorage(...keys: string[]) {
  return chrome.storage.local.remove(keys)
}