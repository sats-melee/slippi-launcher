import type { Theme } from "@mui/material/styles";
import { createTheme } from "@mui/material/styles";

// This is a limitation of MUI theme in that we can't import css variables
// so we'll just hard code these for now.
const colors = {
  accent: "#d33d52",
  accentLight: "#f58b94",

  // These are used on the home/launch page
  grayDark: "#222222",
  surface: "#191b22",
  background: "#101116",
  offGray: "#2D313A",
  offWhite: "#E0E0E0",

  // From slippi website
  textPrimary: "#E9EAEA",
  textSecondary: "#B4B4B4",
  textDim: "#939599",
  textVeryDim: "#5E6066",
} as const;

import { withFont } from "./with_font";

const rubikFont = withFont("Rubik");
const mavenProFont = withFont("Maven Pro");

const theme = createTheme({
  palette: {
    mode: "dark",
    text: {
      primary: "#E9EAEA",
      secondary: "#B4B4B4",
    },
    primary: {
      main: colors.accent,
      contrastText: "#ffffff",
    },
    secondary: {
      main: colors.accentLight,
      contrastText: colors.background,
    },
    divider: "rgba(255,255,255)",
    background: {
      paper: colors.surface,
      default: colors.background,
    },
  },
  typography: {
    fontFamily: rubikFont,
    fontSize: 16,
    h1: {
      fontFamily: mavenProFont,
    },
    h2: {
      fontFamily: mavenProFont,
    },
    h3: {
      fontFamily: mavenProFont,
    },
    h4: {
      fontFamily: mavenProFont,
    },
    h5: {
      fontFamily: mavenProFont,
    },
    h6: {
      fontFamily: mavenProFont,
    },
    caption: {
      opacity: 0.6,
    },
  },
});

const addOverrides = (theme: Theme) => {
  return createTheme({
    ...theme,
    components: {
      MuiTooltip: {
        defaultProps: {
          arrow: true,
        },
        styleOverrides: {
          arrow: {
            color: colors.offWhite,
          },
          tooltip: {
            backgroundColor: colors.offWhite,
            color: colors.background,
            boxShadow: theme.shadows[1],
            fontSize: 13,
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: "filled",
          fullWidth: true,
          size: "small",
        },
      },
      MuiRadio: {
        defaultProps: {
          color: "primary",
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderStyle: "solid",
            borderWidth: "1px",
            borderColor: "transparent",
          },
          rounded: {
            borderRadius: "10px",
            overflow: "hidden",
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottomColor: "#1E1F25",
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            color: "#dddddd",
            "&.Mui-focused": {
              color: "#ffffff",
            },
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: {
          root: {
            minWidth: "initial",
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            "&.Mui-selected": {
              backgroundColor: "rgba(227, 75, 93, 0.16)",
            },
            "&.Mui-selected:hover": {
              backgroundColor: "rgba(227, 75, 93, 0.24)",
            },
          },
        },
      },
      MuiListItem: {
        styleOverrides: {
          root: {
            "&.Mui-selected": {
              backgroundColor: "rgba(227, 75, 93, 0.16)",
            },
            "&.Mui-selected:hover": {
              backgroundColor: "rgba(227, 75, 93, 0.24)",
            },
          },
        },
      },
      MuiButtonBase: {
        styleOverrides: {
          root: {
            fontFamily: rubikFont,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: "10px",
          },
          contained: {
            fontWeight: 700,
            textTransform: "initial",
            borderRadius: "10px",
          },
          outlined: {
            textTransform: "initial",
            borderRadius: "10px",
          },
        },
      },
    },
  });
};

export const slippiTheme = addOverrides(theme);
