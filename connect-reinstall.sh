if [ ! -e target ] ; then
    mkdir target
fi

cp -r lib target
cp index.js target
cp package.json target
cp LICENSE target
cp .npmignore target
cd target
npm install .
