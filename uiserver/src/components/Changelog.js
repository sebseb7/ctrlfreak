import React, { Component } from 'react';
import {
    Container, Paper, Typography, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Box, CircularProgress, Alert
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import { withRouter } from './withRouter';

class Changelog extends Component {
    constructor(props) {
        super(props);
        this.state = {
            logs: [],
            loading: true,
            error: null
        };
    }

    componentDidMount() {
        this.loadLogs();
    }

    componentDidUpdate(prevProps) {
        // Reload if user changes (e.g. login)
        if (prevProps.user !== this.props.user) {
            this.loadLogs();
        }
    }

    loadLogs = () => {
        const { user } = this.props;
        if (!user) {
            this.setState({ loading: false, error: 'Please log in to view changelog' });
            return;
        }

        this.setState({ loading: true, error: null });

        fetch('/api/changelog', {
            headers: {
                'Authorization': `Bearer ${user.token}`
            }
        })
            .then(res => {
                if (!res.ok) {
                    if (res.status === 401) throw new Error('Unauthorized');
                    throw new Error('Failed to fetch logs');
                }
                return res.json();
            })
            .then(logs => this.setState({ logs, loading: false }))
            .catch(err => this.setState({ error: err.message, loading: false }));
    };

    formatDate(isoString) {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleString();
    }

    render() {
        const { logs, loading, error } = this.state;

        return (
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', minHeight: '80vh', bgcolor: 'background.paper' }}>
                    <Typography component="h2" variant="h6" color="primary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <HistoryIcon /> System Changelog
                    </Typography>

                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
                    )}

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 'bold', width: 200 }}>Date</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold', width: 150 }}>User</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Change</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {logs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={3} align="center">No changes recorded yet</TableCell>
                                        </TableRow>
                                    ) : (
                                        logs.map((log) => (
                                            <TableRow key={log.id} hover>
                                                <TableCell sx={{ color: 'text.secondary' }}>{this.formatDate(log.date)}</TableCell>
                                                <TableCell sx={{ color: 'secondary.main' }}>{log.user}</TableCell>
                                                <TableCell>{log.text}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Paper>
            </Container>
        );
    }
}

export default withRouter(Changelog);
