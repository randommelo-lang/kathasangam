export const state = {
  role: "reader",
  stories: null,
  library: [],
  reports: [],
  notifications: [],
  selectedStoryId: "",
  selectedChapterIndex: 0,
  user: null,
  accessToken: null,
  profile: null,
  stats: null,
  progress: [],
  bookmarks: null,
  bookmarkIds: null,
  readingLists: null
};

export const ui = {
  currentView: "discover",
  currentStoryId: "",
  currentChapterIndex: 0,
  currentComicPageIndex: 0,
  currentTextPageIndex: 0,
  editingChapterId: "",
  filterType: "all",
  filterStatus: "all",
  filterLanguage: "all",
  filterSort: "newest",
  showFilterDrawer: false,
  activeChartMetric: "reads",
  readerMode: "scroll",
  readerTheme: "light",
  readerSize: 19,
  activeLibraryTab: "bookmarks",
  activeConversationUserId: null,
  activeConversationUser: null
};

