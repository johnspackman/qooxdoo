#!/bin/bash

##
# Run from cron, run the nightly update of the build stats
##

# - Config section -------------------------------------------------------------
generatorstats=/home/qooxdoo/workspace/qooxdoo.trunk/tool/admin/app/generatorstats
# - Config end -----------------------------------------------------------------

# read yesterday's log
update=`/usr/bin/python $generatorstats/nightly_build_times.py harvest`
if [ $? -eq 0 ]; then
    echo $update >> update.log
else
    echo "Error running: ", $update
fi

# Re-create graph images
/usr/bin/python $generatorstats/nightly_build_times.py graph > /dev/null
