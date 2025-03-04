#!/bin/bash

if [ "${GITHUB_ACTIONS}" != 'true' ]; then 
  echo "ERROR: This script must be executed on the GitHub Actions environment."
  exit 1
fi

DL_URL_BASE='https://github.com/mikefarah/yq/releases/download'
LATEST_URL='https://github.com/mikefarah/yq/releases/latest'

which yq

echo '::group::Prep'
case $RUNNER_OS in
  Linux)
    OS='linux'
    ;;
  macOS)
    OS='darwin'
    ;;

  *)
    echo "Cannot handle OS of type $RUNNER_OS"
    echo "Expected one of: [ Linux macOS ]"
    exit 1
    ;;
esac

case $RUNNER_ARCH in
  'X86')
    ARCH='386'
    ;;
  'X64')
    ARCH='amd64'
    ;;
  'ARM')
    ARCH='arm'
    ;;
  'ARM64')
    ARCH='arm64'
    ;;

  *)
    echo "Cannot handle arch of type $RUNNER_ARCH"
    echo "Expected one of: [ X86 X64 ARM ARM64 ]"
    exit 1
    ;;
esac

FILE_NAME_BASE="yq_${OS}_${ARCH}"
DIR_INSTALL="${RUNNER_TEMP}/${FILE_NAME_BASE}"

echo "Create install dir: ${DIR_INSTALL}"
mkdir -p "${DIR_INSTALL}"

DL_FILE_NAME="${FILE_NAME_BASE}.tar.gz"
DL_FILE_PATH="${RUNNER_TEMP}/${DL_FILE_NAME}"
echo '::endgroup::'

echo "::group::Downloading yq"
LATEST_VERSION_URL="$(curl -w '%{redirect_url}' -s -o /dev/null ${LATEST_URL})"
LATEST_VERSION="${LATEST_VERSION_URL##*/}"

DL_URL="${DL_URL_BASE}/${LATEST_VERSION}/${DL_FILE_NAME}"

echo "Download URL: ${DL_URL}"
echo "Download to : ${DL_FILE_PATH}"

curl -L "${DL_URL}" -o "${DL_FILE_PATH}"
echo '::endgroup::'


echo "::group::Expanding archive"
tar -xvf "${DL_FILE_PATH}" -C "${DIR_INSTALL}"

mv -v "${DIR_INSTALL}/${FILE_NAME_BASE}" "${DIR_INSTALL}/yq"
echo '::endgroup::'

echo "::group::Setting PATH environment variable"
export PATH="${DIR_INSTALL}:${PATH}"
echo "${PATH}"
echo '::endgroup::'