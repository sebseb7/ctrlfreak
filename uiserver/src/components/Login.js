import React, { Component } from 'react';
import { Container, Paper, TextField, Button, Typography, Box } from '@mui/material';
import { withRouter } from './withRouter';

class Login extends Component {
    constructor(props) {
        super(props);
        this.state = {
            username: '',
            password: '',
            error: ''
        };
    }

    handleSubmit = async (e) => {
        e.preventDefault();
        const { username, password } = this.state;
        const { onLogin, router } = this.props;

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (res.ok) {
                onLogin(data);
                router.navigate('/');
            } else {
                this.setState({ error: data.error || 'Login failed' });
            }
        } catch (err) {
            this.setState({ error: 'Network error' });
        }
    };

    render() {
        const { username, password, error } = this.state;

        return (
            <Container maxWidth="xs" sx={{ mt: 8 }}>
                <Paper sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="h5" gutterBottom>Login</Typography>
                    {error && <Typography color="error">{error}</Typography>}
                    <Box component="form" onSubmit={this.handleSubmit} sx={{ mt: 1, width: '100%' }}>
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            label="Username"
                            value={username}
                            onChange={(e) => this.setState({ username: e.target.value })}
                        />
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            label="Password"
                            type="password"
                            value={password}
                            onChange={(e) => this.setState({ password: e.target.value })}
                        />
                        <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }}>
                            Sign In
                        </Button>
                    </Box>
                </Paper>
            </Container>
        );
    }
}

export default withRouter(Login);
