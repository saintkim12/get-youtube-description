import JSZip from 'jszip'

console.log('hello')

export function getFromBackground() {
  
  return 'getFromBackground'
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('onMessage', message)
  if (message === 'zip') {
    ;(async () => {
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
    })()
  }
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