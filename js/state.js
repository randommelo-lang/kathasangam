export const state = {
  role: "reader",
  stories: [],
  library: [],
  reports: [],
  notifications: [],
  selectedStoryId: "",
  selectedChapterIndex: 0,
  user: null,
  accessToken: null,
  profile: null,
  stats: null,
  progress: []
};

export const ui = {
  currentView: "discover",
  currentStoryId: "",
  currentChapterIndex: 0,
  currentComicPageIndex: 0,
  currentTextPageIndex: 0,
  editingChapterId: "",
  filterType: "all",
  readerMode: "scroll",
  readerTheme: "light",
  readerSize: 19
};
