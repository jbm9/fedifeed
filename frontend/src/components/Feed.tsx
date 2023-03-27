import React from 'react';
import { useEffect, useState } from 'react';
import { login, SerializerNativeImpl } from 'masto';

import Container from 'react-bootstrap/Container';
import Stack from 'react-bootstrap/esm/Stack';
import Form from 'react-bootstrap/Form';
import Status from './Status';
import Accordion from 'react-bootstrap/esm/Accordion';




export default function Feed(props: { token: string, server: string }) {
    const [feed, setFeed] = useState<any>([]);
    const [rawFeed, setRawFeed] = useState<any>([]);
    const [api, setApi] = useState<any>(null);
    const [userReblogs, setReblogs] = useState<any>([]);
    const [userCoreServers, setCoreServers] = useState<any>([]);
    const [userReblogWeight, setUserReblogWeight] = useState<number>(2);
    const [topPostWeight, setTopPostWeight] = useState<number>(5);
    const [frequencyWeight, setFrequencyWeight] = useState<number>(1);
    const [timePenalty, setTimePenalty] = useState<number>(1)

    useEffect(() => {
        const token = props.token;
        login({
            accessToken: token,
            url: props.server + '/api/v1/',
        }).then((masto) => {
            setApi(masto)
            constructFeed(masto);
        })
    }, []);

    useEffect(() => {
        let results = sortFeed(rawFeed, userReblogs, userCoreServers);
        results = results.filter((status: any) => {
            return status.content.includes("RT @") === false
        })
        results = results.map((status: any) => {
            if (status.reblog) {
                status.reblog.value = status.value;
                status.reblog.reblog_by = status.account.acct;
                return status.reblog;
            }
            status.reblog_by = null;
            return status;
        })
        setFeed(results);
    }, [userReblogWeight, topPostWeight, frequencyWeight, timePenalty])

    async function constructFeed(masto: any) {
        const res = await fetch("/reblogs")
        const reblogs = await res.json();
        setReblogs(reblogs);
        const res2 = await fetch("/core_servers")
        const core_servers = await res2.json();
        setCoreServers(core_servers);
        Promise.all([
            getHomeFeed(masto),
            getTopPosts(core_servers)
        ])
            .then((data) => {
                console.log(data)
                let results = data.flat(1);
                setRawFeed(results);
                console.log(results.length)
                results = sortFeed(results, reblogs, core_servers);
                results = results.filter((status: any) => {
                    return status.content.includes("RT @") === false
                })
                results = results.map((status: any) => {
                    if (status.reblog) {
                        status.reblog.value = status.value;
                        status.reblog.reblog_by = status.account.acct;
                        return status.reblog;
                    }
                    status.reblog_by = null;
                    return status;
                })
                setFeed(results);
            })
    }

    async function getTopPosts(core_servers: any) {
        let results: any[] = [];
        const serializer = new SerializerNativeImpl();
        for (const server of Object.keys(core_servers)) {
            const res = await fetch(server + "/api/v1/trends/statuses")
            const data: any[] = serializer.deserialize('application/json', await res.text());
            results = results.concat(data.map((status: any) => {
                status.topPost = true;
                return status;
            }).slice(0, 5))
        }
        console.log(results)
        return results;
    }


    async function getHomeFeed(masto: any) {
        if (masto === null) masto = api;
        let results: any[] = [];
        let pages = 10;
        for await (const page of masto.v1.timelines.listHome()) {
            results = results.concat(page)
            pages--;
            if (pages === 0) {
                break;
            }
        }
        return results;
    }

    function sortFeed(array: any[], reblogs: any, core_servers: any) {
        //how often a post is in the feed
        var frequency: any = {};

        array.forEach(function (value: { id: string, uri: string, account: any, reblog: any, topPost: any }) {
            if (!value?.account) {
                console.log("Error")
                console.log(typeof (value))
                console.log(value)
                return;
            }
            if (value.reblog) value.uri = value.reblog.uri;

            if (!(value.uri in frequency)) frequency[value.uri] = 0;

            if (value.account.acct in reblogs) frequency[value.uri] += reblogs[value.account.acct] * userReblogWeight;
            else if (value.topPost) frequency[value.uri] += topPostWeight;
            else frequency[value.uri] += 1;
        });
        array = array.filter(item => item != undefined)
        array = [...new Map(array.map(item => [item["uri"], item])).values()];

        return array.map((item) => {
            const seconds = Math.floor((new Date().getTime() - new Date(item.createdAt).getTime()) / 1000);
            item.value = frequency[item.uri];
            item.value = item.value * (1 - (seconds * timePenalty / 86400));
            console.log(item)
            return item;
        }).sort(function (a, b) {
            return b.value - a.value
        })
    }

    const reblog = (id: string) => {
        const masto = api;
        (async () => {
            const res = await masto.v1.statuses.reblog({ id: id });
            console.log(res);
        })();
    }


    return (
        <Container>
            <h1 style={{ textAlign: "center" }}>Feed</h1>
            <Accordion>
                <Accordion.Item eventKey="0">
                    <Accordion.Header>Feed Algorithmus</Accordion.Header>
                    <Accordion.Body>
                        <Form.Label style={{ textAlign: "center" }}>User Reblog Weight</Form.Label>
                        <Form.Range min="0" max="10" value={userReblogWeight} onChange={(event) => setUserReblogWeight(parseInt(event.target.value))} />
                        <Form.Label style={{ textAlign: "center" }}>Top Post Weight</Form.Label>
                        <Form.Range min="0" max="10" value={topPostWeight} onChange={(event) => setTopPostWeight(parseInt(event.target.value))} />
                        <Form.Label style={{ textAlign: "center" }}>Frequency Weight</Form.Label>
                        <Form.Range min="0" max="10" value={frequencyWeight} onChange={(event) => setFrequencyWeight(parseInt(event.target.value))} />
                        <Form.Label style={{ textAlign: "center" }}>Time Penalty</Form.Label>
                        <Form.Range min="0" max="1" step={0.1} value={timePenalty} onChange={(event) => setTimePenalty(parseFloat(event.target.value))} />
                    </Accordion.Body>
                </Accordion.Item>
            </Accordion>
            <Stack gap={3} style={{ padding: "10px" }} className="mw-50">
                {feed.map((status: any) => {
                    return (
                        <Status status={status} key={status.id} />
                    )
                })}
            </Stack >
        </Container >
    )
}