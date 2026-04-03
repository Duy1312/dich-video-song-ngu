# Multi-Platform Subtitle Extraction — Implementation Plan

## Executive Summary

Expand the browser extension from YouTube-only to support Netflix, Vimeo, Facebook, Udemy, Coursera, TikTok, Twitter/X, and Twitch. Three workstreams: (1) a platform registry with declarative configs + optional custom logic, (2) robust HTML5 TextTrack detection, (3) tab audio capture for STT fallback. All changes are additive — YouTube continues working exactly as it does today.

---
