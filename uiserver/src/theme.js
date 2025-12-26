import { createTheme } from '@mui/material/styles';

const gruvbox = {
    bg: '#282828',
    bg1: '#3c3836',
    bg2: '#504945',
    fg: '#ebdbb2',
    red: '#cc241d',
    green: '#98971a',
    yellow: '#d79921',
    blue: '#458588',
    purple: '#b16286',
    aqua: '#689d6a',
    orange: '#d65d0e',
    gray: '#928374',
};

const theme = createTheme({
    palette: {
        mode: 'dark',
        background: {
            default: gruvbox.bg,
            paper: gruvbox.bg1,
        },
        primary: {
            main: gruvbox.orange,
        },
        secondary: {
            main: gruvbox.blue,
        },
        text: {
            primary: gruvbox.fg,
            secondary: gruvbox.gray,
        },
        error: {
            main: gruvbox.red,
        },
        success: {
            main: gruvbox.green,
        },
        warning: {
            main: gruvbox.yellow,
        },
        info: {
            main: gruvbox.blue,
        },
    },
    typography: {
        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
        h1: { fontSize: '2rem', fontWeight: 600, color: gruvbox.fg },
        h2: { fontSize: '1.5rem', fontWeight: 500, color: gruvbox.fg },
        body1: { color: gruvbox.fg },
    },
    components: {
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: gruvbox.bg2,
                    color: gruvbox.fg,
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundColor: gruvbox.bg1,
                    backgroundImage: 'none',
                },
            },
        },
    },
});

export default theme;
