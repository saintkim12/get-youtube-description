
interface VideoItem {
  videoId: string,
  videoTitle: string,
  url: string,
  description: string,
  filename: string,
}

type VideoItemWithText = VideoItem & { textToFile: string }
