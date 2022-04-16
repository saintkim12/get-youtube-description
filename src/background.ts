import JSZip from 'jszip'
import cond from 'lodash/fp/cond'
import flow from 'lodash/fp/flow'

export function getFromBackground() {
  
  return 'getFromBackground'
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('onMessage', message)
  cond<string, Promise<any>>([
    [m => m === 'zip', async () => {
      const videoList: VideoItem[] = await getStorage()
      
      const zip = new JSZip()
      const downloadVideoIdList: string[] = videoList.filter((item) => item.text?.length > 0).map((item, idx) => {
        // zip.file(`${new String(idx).padStart(3, '0')}_${item.videoTitle.slice(0, 20)}.md`, item.text)
        zip.file(item.filename, item.text)
        return item.videoId
      })

      const content = await zip.generateAsync({ type: 'base64', platform: 'UNIX' })
      // fileDownload(content, 'test.zip')
      const url = `data:application/zip;base64,${content}`
      // console.log('url', url)

      await chrome.downloads.download({
        url,
        filename: `${Date.now()}.zip`
      })
      
      sendResponse({ result: true, videoIds: downloadVideoIdList })
    }],
    [m => m === 'getFromPlaylist', async () => {
      const parsePage = async (item: VideoItem) => {
        const url = item.url
        if (!url) return item
        const html = await fetch(url).then(r => r.text())
        // const dom = $(html)
        // console.log('html', html)
        // console.log('dom', dom)
        // console.log('$', $)
        // const target = flow(
        //   $html => $html.closest('script:contains("var ytInitialPlayerResponse")').html(),
        //   script => script.split(';var meta')[0],
        //   script => script.replace(/[\s]*var ytInitialPlayerResponse[\s]*=[\s]*/, ''),
        //   jsonStr => JSON.parse(jsonStr)
        // )(dom)
        const target = flow(
          $html => $html.slice($html.indexOf('var ytInitialPlayerResponse')),
          $html => $html.slice(0, $html.indexOf(';var meta')),
          script => script.replace(/[\s]*var ytInitialPlayerResponse[\s]*=[\s]*/, ''),
          jsonStr => JSON.parse(jsonStr)
        )(html)
        // console.log('target', target)

        const videoId = target.videoDetails.videoId
        const videoTitle = target.videoDetails.title
        const md = [ 
          `# ${target.videoDetails.title}`,
          `${target.videoDetails.shortDescription}`,
        ].join('\n')
        item.videoId = videoId
        item.videoTitle = videoTitle
        item.text = md
        item.filename = `${item.videoTitle.replace(/\/\\/gi, ',').slice(0, 255)}.md`
        // item.filename = `${item.videoTitle.slice(0, 20)}.md`

        // fileDownload(md, `${target.videoDetails.title.slice(0, 20)}.md`)

        // console.log('setStorage', JSON.parse(JSON.stringify(videoList)))
        // return await setStorage(JSON.parse(JSON.stringify(videoList)))
        return item
      }

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
    
      // console.log('result', result)
      
      const $orgVideoList: VideoItem[] = await getStorage()
      const $newVideoList: VideoItem[] = result.map(url => (<VideoItem> { videoId: '', videoTitle: '', url, text: '', filename: '' }))
      
      // await setStorage(JSON.parse(JSON.stringify($orgVideoList.concat($newVideoList))))
      // sendResponse({ resultType: 'init', result: true })

      const parserVideoList = await Promise.allSettled(
        $newVideoList.map(item => parsePage(item))
      )
      // console.log('parserVideoList', parserVideoList)
      const videoList = $orgVideoList.concat(parserVideoList.map((result, i) => (<PromiseFulfilledResult<VideoItem>> result)?.value ?? $newVideoList[i]))
      // console.log('videoList', videoList)

      // console.log('setStorage', JSON.parse(JSON.stringify(videoList)))
      await setStorage(JSON.parse(JSON.stringify(videoList)))
      sendResponse({ resultType: 'load', result: true })
      
    }]
  ])(message)
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