#!/bin/bash
set -e

lerna version ${1:-minor} --conventional-commits --create-release github
lerna publish from-package
