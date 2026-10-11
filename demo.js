(function (root) {
  'use strict';
  const files = [
    { name: 'Alex.srt', text: '1\n00:00:01,000 --> 00:00:03,500\nShall we start with the launch plan?\n\n2\n00:00:05,000 --> 00:00:07,000\nYes, let’s keep the small details.\nEven the second line.\n\n3\n00:00:09,000 --> 00:00:11,500\nGreat. One conversation, every voice.\n' },
    { name: '小林.vtt', text: 'WEBVTT\n\nNOTE Synthetic bilingual example; no real conversation.\n\nreply-1\n00:02.800 --> 00:04.600 align:start\n可以，我已经准备好了。\n\nreply-2\n00:07.000 --> 00:09.000\nAnd keep the timing when we overlap.\n\nreply-3\n00:09.000 --> 00:10.200\n没错！\n' }
  ];
  if (typeof module === 'object' && module.exports) module.exports = files;
  else root.CaptionMergerDemo = files;
})(typeof globalThis !== 'undefined' ? globalThis : this);
