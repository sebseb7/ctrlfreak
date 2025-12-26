import React, { Component } from 'react';
import { Box, Typography, Container, CircularProgress } from '@mui/material';
import Chart from './Chart';
import { withRouter } from './withRouter';

class ViewDisplay extends Component {
    constructor(props) {
        super(props);
        this.state = {
            view: null,
            loading: true,
            error: null
        };
    }

    componentDidMount() {
        this.fetchView();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.router.params.id !== this.props.router.params.id) {
            this.fetchView();
        }
    }

    fetchView() {
        const { id } = this.props.router.params;
        this.setState({ loading: true, error: null });

        fetch(`/api/views/${id}`)
            .then(res => {
                if (!res.ok) throw new Error('View not found');
                return res.json();
            })
            .then(data => {
                this.setState({ view: data, loading: false });
            })
            .catch(err => {
                this.setState({ error: err.message, loading: false });
            });
    }

    render() {
        const { view, loading, error } = this.state;

        if (loading) return <Container sx={{ mt: 4, textAlign: 'center' }}><CircularProgress /></Container>;
        if (error) return <Container sx={{ mt: 4 }}><Typography color="error">{error}</Typography></Container>;

        // Parse view config & Flatten groups if present
        let channels = [];
        let axes = { left: {}, right: {} };

        if (view.config) {
            if (Array.isArray(view.config)) {
                channels = view.config;
            } else if (view.config.groups) {
                // Flatten groups
                view.config.groups.forEach(g => {
                    if (g.channels) channels = [...channels, ...g.channels];
                    if (g.axes) {
                        if (g.axes.left) axes.left = { ...axes.left, ...g.axes.left };
                        if (g.axes.right) axes.right = { ...axes.right, ...g.axes.right };
                    }
                });
            } else if (view.config.channels) {
                channels = view.config.channels;
                axes = view.config.axes;
            }
        }

        return (
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2, gap: 2 }}>
                <Typography variant="h5">{view.name}</Typography>
                <Box sx={{ flexGrow: 1 }}>
                    <Chart
                        channelConfig={channels.map(c => ({
                            id: `${c.device}:${c.channel}`,
                            alias: c.alias,
                            yAxis: c.yAxis || 'left',
                            color: c.color
                        }))}
                        axisConfig={axes}
                    />
                </Box>
            </Box>
        );
    }
}

export default withRouter(ViewDisplay);
