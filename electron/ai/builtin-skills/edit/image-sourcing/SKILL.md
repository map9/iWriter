---
name: image-sourcing
description: Use when the user asks to add, supplement, or embed real images/photos into a document (配图/补充图片/加图/插图). Finds real, verified image direct-links via web_search/fetch_url, embeds them with markdown image syntax, and never fabricates or uses placeholder images.
---

# Image Sourcing

## When to use

Load this skill whenever the user wants real images or photos added to a document — for any topic: travel, people, places, science, products, events. The sourcing workflow is the same regardless of subject.

## Core rule: source images first, write document second

Do not create the document first and then go back to patch in images. This causes block ID drift and requires multiple correction rounds.

**Correct order:**
1. Research topic (web_search for text info)
2. Source real image direct-links in the same research pass
3. Validate each candidate link with fetch_url
4. Write the document in one shot with real images already embedded

## Finding image direct-links

### From web_search (Tavily)
`web_search` results may include an `image_urls` array — these are already validated direct embeddable links with descriptions. Use them first. Pick the one whose description best matches the subject; do not reuse the same URL for multiple different captions.

For landmarks, places, or public-domain subjects, add `Wikimedia Commons` to the query to get freely-licensed, high-quality results:
```
web_search("五台山 Wikimedia Commons")
web_search("Yanmenguan Great Wall site:commons.wikimedia.org")
```

### From fetch_url on a page
`fetch_url` returns an `imageLinks` array alongside the page text. These direct-links are preserved even when the page text is truncated. Check `imageLinks` before reading the markdown body for image links.

### From a Commons File: page or category page
`fetch_url("https://commons.wikimedia.org/wiki/File:Yanmenguan.jpg")` will return `imageLinks` containing the resolved `upload.wikimedia.org` direct URL. Use that URL, not the `/wiki/File:` page URL itself.

## Validating a direct-link before embedding

Any candidate URL ending in `.jpg`, `.png`, `.webp`, etc. can be validated with `fetch_url`:

```
fetch_url("https://upload.wikimedia.org/wikipedia/commons/thumb/.../800px-x.jpg")
```

A valid image returns `isImage: true` and a `finalUrl`. Use `finalUrl` as the embed link.

**If validation returns an error or `isImage` is false → do not embed that URL.** Find an alternative instead.

## Embedding

Use standard markdown image syntax:
```markdown
![Descriptive alt text](https://direct.image.url/path/file.jpg)
```

Optionally add a brief attribution line below the image (especially for Wikimedia Commons):
```markdown
*Source: Wikimedia Commons / Author Name / CC BY-SA 4.0*
```

## Hard rules (never break these)

- ❌ **Never generate or recall image URLs from model training data or memory.** Every embedded URL must be the direct output of a tool call in this session: `web_search → image_urls`, `fetch_url → imageLinks`, or `fetch_url` returning `isImage: true`. Photo IDs like `images.unsplash.com/photo-{id}` or Wikipedia filenames that you did not receive from a tool are forbidden — even if you are confident they exist. Plausible-looking URLs from memory are unreliable and may 404 or show the wrong subject.
- ❌ No placeholder or random-match services: `source.unsplash.com/featured/?keyword`, `picsum.photos`, `placeholder.com`, `loremflickr`, etc. — these return random images, not the actual subject.
- ❌ No guessing or hand-constructing image URLs (e.g. guessing a Wikipedia thumb path). Only embed URLs returned by tools or validated by `fetch_url`.
- ❌ Do not embed HTML page URLs or unresolved redirect URLs (`Special:FilePath/...`, `Special:Redirect/file/...`) as `<img src>` — these are redirect pages, not image files. Use `fetch_url` to resolve them to a direct link first.
- ❌ Do not reuse the same image URL for multiple different captions/subjects.
- ❌ If a real image cannot be found for a specific subject, omit it with a brief note ("no freely-licensed image found") rather than substituting a wrong or placeholder image.
- ❌ Do not silently replace user-requested images with text annotations — if you truly cannot find a real image, say so and ask whether to skip or try a different source.

## When no image is available

- Try at least two search queries before giving up (different keywords, English + native language, `site:commons.wikimedia.org`).
- If still not found: tell the user which subjects have no available image and ask whether to skip those entries or use a placeholder they provide.
