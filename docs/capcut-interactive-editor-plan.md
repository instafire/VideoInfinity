# CapCut-Style Interactive Editor Plan

## Goal

Replace the current split authoring flow with one editor surface that feels closer to CapCut while preserving VideoStudio's core model:

- import source media
- cut reusable scenes
- place scenes on a story spine
- add timed choices, hotspot images, and branch clips
- preview and publish the same interactive runtime

The editor should feel like a timeline-based movie builder, not a collection of tabs.

## Current Constraint

Today the app is split across three separate authoring tools:

- `clipper`: trims a source video into a playable scene
- `eventCreator`: creates special event clips with inline choices
- `logic`: adds timed choice blocks on a selected clip

That works, but it forces the user to switch mental models. The current runtime is still solid:

- `clips` are playable scene assets
- `edges` are timed branch rules
- `storySequence` is the linear publish spine

The new editor should keep that runtime contract and compile into it, instead of rewriting the player first.

## Recommended Architecture

Build one authoritative authoring timeline and compile it into the existing publish/runtime format.

### Authoring Objects

- `Asset`
  - imported media
  - types: `video`, `audio`, `image`, `overlay-image`
- `SceneClip`
  - reusable cut from a source asset
  - keeps scene metadata: name, chapter, title card, subtitle, notes, ending flag
- `TimelineSequenceItem`
  - placement of a `SceneClip` on the main story spine
  - supports per-use overrides
- `ChoicePod`
  - a timed interaction block attached to the story spine
  - contains:
    - `triggerTime`
    - `behaviorType`
    - `timeout`
    - `options[]`
- `ChoiceOption`
  - one branch option inside a `ChoicePod`
  - can target:
    - another scene clip
    - a branch lane
    - a return/rejoin point
  - can use:
    - card UI
    - image hotspot UI
    - clip preview
    - still image preview
- `OverlayItem`
  - timed overlay on top of the viewer
  - examples: title card, subtitle, image element, lower-third, callout, sticker

## Editor Layout

Use one persistent 4-region editor layout.

- Left panel: media/story bin
  - tabs: `Media`, `Scenes`, `Choices`, `Images`, `Audio`, `Presets`
- Center: viewer
  - playback
  - hotspot/image placement
  - subtitle/title preview
  - safe-area guides
- Right panel: inspector
  - changes based on current selection
  - scene, overlay, choice pod, option, hotspot, audio item
- Bottom: timeline
  - zoom
  - snapping
  - drag/drop
  - trimming
  - markers
  - nested branch lanes

## Timeline Model

The main timeline should stay readable. Do not render every branch inline all the time.

### Core Tracks

- `V1 Main Story`
  - the linear spine of the interactive movie
- `A1..An Audio`
  - source audio, music, SFX
- `GFX`
  - title cards, subtitles, image overlays, visual elements
- `I1 Interaction`
  - choice pods, timers, QTEs, hotspots

### Expandable Branch Tracks

- `B1..Bn Branch Lanes`
  - hidden by default
  - opened only when a choice pod is selected
  - visually attached to the interaction point that spawned them

### Option Preview Tracks

- `O1..On Option Preview`
  - lightweight preview strips aligned to a choice trigger
  - show the clip or image the viewer will see when hovering/selecting
  - authoring affordance only, not the primary playback spine

## How Option Clips And Images Should Work

You want to insert option clips or images into the main movie timeline. The clean way is:

1. The main story stays on `V1 Main Story`.
2. A choice moment becomes a `ChoicePod` on `I1 Interaction`.
3. Each option can reference:
   - a target `SceneClip`
   - a branch lane clip sequence
   - a static hotspot image
4. The timeline shows:
   - a compact choice block on the interaction track
   - option preview cards or strips aligned to the trigger point
   - expandable nested branch lanes below the trigger

That gives you the CapCut editing feel without turning the main timeline into an unreadable branch forest.

## Why This Fits The Existing Runtime

Compile the new editor back into the current runtime model:

- `V1 Main Story` -> `storySequence`
- `ChoicePod` -> grouped `edges` with `logic_id`
- `SceneClip` -> existing `clips`
- image hotspots -> existing choice overlay fields on `edges`
- branch lane targets -> existing `to_id` links

This preserves:

- preview behavior
- published player behavior
- analytics
- diagnostics

## Feature Mapping

### Existing Features That Survive

- clip cutting
- event clips
- timed choice blocks
- QTEs
- timeout branches
- hotspot images
- title cards
- subtitles
- achievements
- variable locks
- publish sequence

### New Features This Editor Unlocks

- drag/drop story spine
- direct-in-timeline branch editing
- branch lanes
- option clips visible in the timeline
- image overlays as timed objects
- direct viewer hotspot authoring
- title/subtitle overlays as proper timeline elements
- better audio layering
- reusable interaction presets

## Migration Plan

### Phase 1: Unified Editor Shell

Goal: replace view-hopping with one CapCut-style screen.

- keep existing data model
- keep existing endpoints
- build the 4-region shell
- move:
  - clip library into left bin
  - scene preview into viewer
  - scene metadata into inspector
  - existing logic timeline into bottom track area

### Phase 2: Main Story Timeline

Goal: make `storySequence` a real drag/drop timeline.

- drag scenes from the `Scenes` bin to `V1 Main Story`
- support reorder, trim preview, markers, zoom
- remove the current publish list as the primary sequencing UI

### Phase 3: Interaction Track

Goal: replace the current logic editor with timeline-native choice pods.

- add `I1 Interaction`
- show timed decision blocks on the main spine
- select a block to edit in the inspector
- compile changes through the current save logic path

### Phase 4: Option Clips And Image Options

Goal: allow options to behave like timeline items.

- show each option as a preview strip or card aligned to the trigger
- allow the option to use:
  - target clip preview
  - static image
  - hotspot image
- allow nested branch lanes for option-specific clip sequences

### Phase 5: Viewer-Based Hotspot Authoring

Goal: stop editing hotspots with only numeric fields.

- draw hotspot directly in the viewer
- resize and reposition with drag handles
- keep inspector fields as precision overrides
- sync hotspot timing to the interaction track

### Phase 6: Runtime Parity And Cleanup

Goal: retire the old split tools only after parity is proven.

- preview must run the compiled runtime artifact
- publish must use the same compiled artifact
- remove or hide:
  - old event creator
  - old logic-only timeline
  - old publish sequence list

## Recommended First Build

The best first implementation is:

1. ship the unified editor shell
2. make the story spine a real timeline
3. place choice pods on an interaction track
4. open branch lanes on demand

Do not start with full NLE complexity.

The first version should feel like:

- CapCut for the main movie spine
- nested branch trays for interactive logic
- direct hotspot/image placement in the viewer

## What Not To Do

- do not flatten every branch into the main timeline at once
- do not make the published player understand a full editing timeline before the compiler exists
- do not store every new visual behavior as more scalar fields on `clips`
- do not remove the current runtime contract until the new editor compiles to it reliably

## Bottom Line

The right path is:

- one editor
- one story spine
- one interaction track
- expandable branch lanes
- overlays and images as timeline items
- compile back into `clips + edges + storySequence`

That gets you the CapCut feel while keeping VideoStudio an interactive movie maker instead of turning it into a generic video editor.
