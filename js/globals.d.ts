declare global {
  interface Window {
    KATHASANGAM_API_URL?: string;
    supabase?: any;
    supabaseClient?: any;
    mfaEnrollFactorId?: string;
    mfaDisableFactorId?: string;
    mfaChallengeFactorId?: string;
    email2faAddress?: string;
    kathasangam_loaded?: boolean;
    state?: any;
    render?: () => void;
    notify?: (msg: string) => void;
    achievements?: any;
    openAchievementModal?: (id: string) => void;
    i18n?: any;
    perfMetrics?: any;
  }

  interface AnimatedIconProps {
    /** Icon size in pixels or CSS string */
    size?: number | string;
    /** Icon color (defaults to currentColor) */
    color?: string;
    /** SVG stroke width */
    strokeWidth?: number;
    /** Additional CSS classes */
    className?: string;
  }

  interface AnimatedIconHandle {
    startAnimation: () => void;
    stopAnimation: () => void;
  }
}

export interface AnimatedIconProps {
  /** Icon size in pixels or CSS string */
  size?: number | string;
  /** Icon color (defaults to currentColor) */
  color?: string;
  /** SVG stroke width */
  strokeWidth?: number;
  /** Additional CSS classes */
  className?: string;
}

export interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}


