import JSZip from 'jszip'
import cond from 'lodash/fp/cond'
import flow from 'lodash/fp/flow'
import { Ref, ref } from 'vue'

const DESCRIPTION_TEMPLATE_SAMPLE = [
  '# ${videoTitle}',
  '',
  '${description}',
  '',
  'Video URL: ${url}',
].join('\n')
async function parsePage(item: VideoItem) {
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
  item.filename = `${item.videoTitle.replace(/\/\\/gi, ',').slice(0, 255)}.md`
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
            [({ cmd }) => cmd === 'getDescriptionTemplateSample', async (message) => {
              port.postMessage({ result: true, template: DESCRIPTION_TEMPLATE_SAMPLE })
            }],
            [({ cmd }) => cmd === 'zip', async (message) => {
              const option: { template?: string, clearAfterDownload: boolean } = { clearAfterDownload: false, ...message?.args?.[0] }
              const videoList: VideoItem[] = await getStorage()
              
              const zip = new JSZip()
              const descriptionParsedVideoList: VideoItemWithText[] = videoList.map((item) => parseItemWithDescription(item, option.template))
              const downloadVideoIdList: string[] = descriptionParsedVideoList.filter((item) => item.textToFile?.length > 0).map((item, idx) => {
                // zip.file(`${new String(idx).padStart(3, '0')}_${item.videoTitle.slice(0, 20)}.md`, item.text)
                zip.file(item.filename, item.textToFile)
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

              /* 브라우저 - 다운로드 옵션에 따라 다운로드가 안되는 경우가 있어 api 대신 스크립트 삽입 방식 사용 */
              // await chrome.downloads.download({
              //   url,
              //   filename: `${Date.now()}.zip`
              // })
              downloadFileWithTab({ url, filename })

              if (option.clearAfterDownload) {
                // 다운받은 비디오는 항목에서 삭제
                const videoIds = downloadVideoIdList
                await getStorage().then(videoList => {
                  return setStorage(videoList.filter((item: VideoItem) => !videoIds.includes(item.videoId)))
                })
              }

              port.postMessage({ result: true, url, videoIds: downloadVideoIdList })
            }],
            [({ cmd }) => cmd === 'parseDescription', async (message) => {
              const option: { item: VideoItem, template?: string } = { ...message?.args?.[0] }
              const parsedItem = parseItemWithDescription(option.item, option.template)
              
              port.postMessage({ result: true, videoItem: parsedItem })
            }],
            [({ cmd }) => cmd === 'parsePage', async ({ args = [] }) => {
              const orgVideoList = args.map(item => <VideoItem> item)
              const parserVideoList = await Promise.allSettled(
                orgVideoList.map(item => parsePage(item))
              )
              const videoList = parserVideoList.map((result, i) => (<PromiseFulfilledResult<VideoItem>> result)?.value ?? orgVideoList[i])
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
                  console.log('result in tab', result)
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
                  console.log('result in tab', result)
                  return result
                }
              }).then(([result]) => <string[]> result?.result ?? [])
            
              console.log('result', result)
    
              const videoList: Ref<VideoItem[]> = ref([])
              const $orgVideoList: VideoItem[] = await getStorage()
              const $newVideoList: VideoItem[] = result.map(url => (<VideoItem> { videoId: '', videoTitle: '', url, description: '', filename: '' }))
              
              videoList.value = videoList.value.concat($orgVideoList).concat($newVideoList)
    
              port.postMessage({ result: true, ended: false, videoList: videoList.value })
              
              // await setStorage(JSON.parse(JSON.stringify($orgVideoList.concat($newVideoList))))
              // sendResponse({ resultType: 'init', result: true })
              
              const parserVideoList = await Promise.allSettled(videoList.value.map(
                (item, idx) => ((idx >= $orgVideoList.length) ? parsePage(item) : Promise.resolve(item))))
              videoList.value = parserVideoList.map((result, i) => (<PromiseFulfilledResult<VideoItem>> result)?.value ?? videoList.value[i])
              
              // console.log('videoList.value', [...videoList.value])
              // console.log('parserVideoList', parserVideoList)
              // const videoList = $orgVideoList.concat(parserVideoList.map((result, i) => (<PromiseFulfilledResult<VideoItem>> result)?.value ?? $newVideoList[i]))
              
              // console.log('videoList', videoList)
    
              // console.log('setStorage', JSON.parse(JSON.stringify(videoList)))
              await setStorage(JSON.parse(JSON.stringify(videoList.value)))
              
              port.postMessage({ result: true, ended: true, videoList: videoList.value })
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