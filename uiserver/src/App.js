import React, { Component } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Box, CssBaseline } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import DashboardIcon from '@mui/icons-material/Dashboard';
import RuleIcon from '@mui/icons-material/Rule';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';

import Login from './components/Login';
import ViewManager from './components/ViewManager';
import ViewDisplay from './components/ViewDisplay';
import RuleEditor from './components/RuleEditor';
import OutputConfigEditor from './components/OutputConfigEditor';

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
                    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh' }}>
                        <AppBar position="static">
                            <Toolbar>
                                <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                                    CTRL Freak
                                </Typography>

                                <Button color="inherit" component={Link} to="/" startIcon={<DashboardIcon />}>Views</Button>
                                {user && user.role === 'admin' && (
                                    <>
                                        <Button color="inherit" component={Link} to="/rules" startIcon={<RuleIcon />}>Rules</Button>
                                        <Button color="inherit" component={Link} to="/outputs" startIcon={<SettingsInputComponentIcon />}>Outputs</Button>
                                    </>
                                )}

                                {user ? (
                                    <Button color="inherit" onClick={this.handleLogout}>Logout ({user.username})</Button>
                                ) : (
                                    <Button color="inherit" component={Link} to="/login">Login</Button>
                                )}
                            </Toolbar>
                        </AppBar>

                        <Routes>
                            <Route path="/" element={<ViewManager user={user} />} />
                            <Route path="/views/:id" element={<ViewDisplay />} />
                            <Route path="/rules" element={<RuleEditor user={user} />} />
                            <Route path="/outputs" element={<OutputConfigEditor user={user} />} />
                            <Route path="/login" element={<Login onLogin={this.handleLogin} />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </Box>
                </BrowserRouter>
            </ThemeProvider>
        );
    }
}
