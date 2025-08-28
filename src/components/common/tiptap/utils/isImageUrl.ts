export async function isImageUrl(url: string) {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    const contentType = response.headers.get('Content-Type')

    return contentType && contentType.startsWith('image/')
  } catch (error) {
    return false
  }
}