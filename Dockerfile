FROM cypress/included:7.7.0

WORKDIR /e2e

COPY cypress-e2e ./

RUN --mount=type=cache,id=root_cache_nodejs,target=/root/cache/nodejs,sharing=private \
    cp package.json /root/cache/nodejs && \
    cd /root/cache/nodejs && \
    npm i && \
    cp -a node_modules "${OLDPWD}" && \
    cd - > /dev/null

ENTRYPOINT [""]
CMD ["node", "index.js", "run", "--browser", "chrome", "--headless"]
