import React, { Component } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Box, CssBaseline, Link as MuiLink, useMediaQuery } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import DashboardIcon from '@mui/icons-material/Dashboard';
import RuleIcon from '@mui/icons-material/Rule';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';
import GitHubIcon from '@mui/icons-material/GitHub';
import HistoryIcon from '@mui/icons-material/History';

import Login from './components/Login';
import ViewManager from './components/ViewManager';
import ViewDisplay from './components/ViewDisplay';
import RuleEditor from './components/RuleEditor';
import OutputConfigEditor from './components/OutputConfigEditor';
import Changelog from './components/Changelog';

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#fb4934' }, // Gruvbox red
        secondary: { main: '#83a598' }, // Gruvbox blue
        background: {
            default: '#282828', // Gruvbox dark bg
            paper: '#3c3836', // Gruvbox dark lighter
        },
        text: {
            primary: '#ebdbb2',
            secondary: '#a89984'
        }
    },
});

export default class App extends Component {
    constructor(props) {
        super(props);
        this.state = {
            user: null, // { username, role, token }
            loading: true
        };
    }

    componentDidMount() {
        // Check for existing token
        const token = localStorage.getItem('authToken');
        const username = localStorage.getItem('authUser');
        const role = localStorage.getItem('authRole');

        if (token && username) {
            this.setState({ user: { username, role, token } });
        }

        this.setState({ loading: false });
    }

    handleLogin = (userData) => {
        this.setState({ user: userData });
        localStorage.setItem('authToken', userData.token);
        localStorage.setItem('authUser', userData.username);
        localStorage.setItem('authRole', userData.role);
    };

    handleLogout = () => {
        this.setState({ user: null });
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        localStorage.removeItem('authRole');
    };

    render() {
        const { user } = this.state;

        // While checking auth, we could show loader, but it's sync here mostly.

        return (
            <ThemeProvider theme={darkTheme}>
                <CssBaseline />
                <BrowserRouter>
                    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                        <AppBar position="static">
                            <Toolbar>
                                <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
                                    <img src="/ctrlfrk.png" alt="CTRL Freak" style={{ height: 40 }} />
                                </Box>

                                <Button color="inherit" component={Link} to="/" sx={{ minWidth: { xs: 'auto', sm: '64px' }, px: { xs: 1, sm: 2 } }}>
                                    <DashboardIcon />
                                    <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 0.5 }}>Views</Box>
                                </Button>
                                {user && user.role === 'admin' && (
                                    <>
                                        <Button color="inherit" component={Link} to="/rules" sx={{ minWidth: { xs: 'auto', sm: '64px' }, px: { xs: 1, sm: 2 } }}>
                                            <RuleIcon />
                                            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 0.5 }}>Rules</Box>
                                        </Button>
                                        <Button color="inherit" component={Link} to="/outputs" sx={{ minWidth: { xs: 'auto', sm: '64px' }, px: { xs: 1, sm: 2 } }}>
                                            <SettingsInputComponentIcon />
                                            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 0.5 }}>Outputs</Box>
                                        </Button>
                                    </>
                                )}
                                {user && (
                                    <Button color="inherit" component={Link} to="/changelog" sx={{ minWidth: { xs: 'auto', sm: '64px' }, px: { xs: 1, sm: 2 } }}>
                                        <HistoryIcon />
                                        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' }, ml: 0.5 }}>Log</Box>
                                    </Button>
                                )}

                                {user ? (
                                    <Button color="inherit" onClick={this.handleLogout} sx={{ minWidth: { xs: 'auto', sm: '64px' }, px: { xs: 1, sm: 2 } }}>
                                        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Logout ({user.username})</Box>
                                        <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>👤</Box>
                                    </Button>
                                ) : (
                                    <Button color="inherit" component={Link} to="/login" sx={{ minWidth: { xs: 'auto', sm: '64px' }, px: { xs: 1, sm: 2 } }}>
                                        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Login</Box>
                                        <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>👤</Box>
                                    </Button>
                                )}
                            </Toolbar>
                        </AppBar>

                        <Box sx={{ flexGrow: 1 }}>
                            <Routes>
                                <Route path="/" element={<ViewManager user={user} />} />
                                <Route path="/views/:id" element={<ViewDisplay />} />
                                <Route path="/rules" element={<RuleEditor user={user} />} />
                                <Route path="/outputs" element={<OutputConfigEditor user={user} />} />
                                <Route path="/changelog" element={<Changelog user={user} />} />
                                <Route path="/login" element={<Login onLogin={this.handleLogin} />} />
                                <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                        </Box>
                        <Box sx={{ p: 2, textAlign: 'center' }}>
                            <MuiLink href="https://github.com/sebseb7/ctrlfreak" target="_blank" rel="noopener" color="inherit" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.8rem', color: 'text.secondary', opacity: 0.7 }}>
                                <GitHubIcon fontSize="small" />
                                ctrlfreak
                            </MuiLink>
                        </Box>
                    </Box>
                </BrowserRouter>
            </ThemeProvider>
        );
    }
}
