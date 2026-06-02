export interface ImageUrlResolution {
  ok: boolean
  url?: string
  contentType?: string
  status?: number
  error?: string
}

export async function resolveImageUrl(url: string): Promise<ImageUrlResolution> {
  if (window.electronAPI?.resolveImageUrl) {
    return window.electronAPI.resolveImageUrl(url)
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Range: 'bytes=0-0',
      },
    })
    const contentType = response.headers.get('Content-Type')

    await response.body?.cancel()

    return {
      ok: response.ok && !!contentType?.startsWith('image/'),
      url: response.url,
      contentType: contentType ?? undefined,
      status: response.status,
      error: response.ok ? undefined : response.statusText,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function isImageUrl(url: string): Promise<boolean> {
  return (await resolveImageUrl(url)).ok
}
