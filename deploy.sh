while getopts k:h:s: flag
do
    case "${flag}" in
        k) key=${OPTARG};;
        h) hostname=${OPTARG};;
    esac
done

service=canvas-gradebook

if [[ -z "$key" || -z "$hostname" ]]; then
    printf "\nMissing required parameter.\n"
    printf "  syntax: deployReact.sh -k <pem key file> -h <hostname>\n\n"
    exit 1
fi

printf "\n----> Deploying $service to $hostname with $key\n"

ssh -i "$key" ubuntu@$hostname << ENDSSH
mkdir -p services/${service}
ENDSSH

printf "\n----> Copy the distribution package to the target\n"
scp -r -i "$key" *.js *.json ubuntu@$hostname:services/$service

# This assumes that Node.js and PM2 are already installed on the target server and
# that the service was registered with PM2 previously.
#
# To register the service initially, use:
# ssh -i "$key" ubuntu@$hostname
# cd services/canvas-gradebook
# npm install
# pm2 start main.js --name canvas-gradebook -- --repeat

printf "\n----> Installing packages and restarting daemon\n"
ssh -tt -i "$key" ubuntu@$hostname << ENDSSH
cd services/${service}
npm install
pm2 restart canvas-gradebook
ENDSSH

