import React, { Component } from 'react';
import { Container, Typography, List, ListItem, ListItemText, Switch, CircularProgress } from '@mui/material';

export default class Settings extends Component {
    constructor(props) {
        super(props);
        this.state = {
            devices: [],
            loading: true
        };
    }

    componentDidMount() {
        fetch('/api/devices')
            .then(res => res.json())
            .then(data => this.setState({ devices: data, loading: false }))
            .catch(err => {
                console.error("Failed to fetch devices", err);
                this.setState({ loading: false });
            });
    }

    toggleChannel = (id) => {
        // Toggle selection
        // We need to notify parent component about change (onSelectionChange)
        const { selectedChannels, onSelectionChange } = this.props;
        const newSelection = selectedChannels.includes(id)
            ? selectedChannels.filter(c => c !== id)
            : [...selectedChannels, id];

        onSelectionChange(newSelection);
    };

    render() {
        const { loading, devices } = this.state;
        const { selectedChannels } = this.props;

        if (loading) return <Container sx={{ mt: 4, textAlign: 'center' }}><CircularProgress /></Container>;

        return (
            <Container maxWidth="md" sx={{ mt: 4 }}>
                <Typography variant="h4" gutterBottom>Settings</Typography>
                <Typography variant="subtitle1" gutterBottom>Select Channels for Live View</Typography>
                <List>
                    {devices.map((item, idx) => {
                        const id = `${item.device}:${item.channel}`;
                        return (
                            <ListItem key={idx}>
                                <ListItemText primary={`${item.device} - ${item.channel}`} />
                                <Switch
                                    edge="end"
                                    checked={selectedChannels.includes(id)}
                                    onChange={() => this.toggleChannel(id)}
                                />
                            </ListItem>
                        );
                    })}
                </List>
            </Container>
        );
    }
}
