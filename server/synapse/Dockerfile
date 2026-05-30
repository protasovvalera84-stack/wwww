# Custom Synapse image with S3 media storage provider.
# Adds synapse-s3-storage-provider so Synapse can store media in MinIO.
FROM matrixdotorg/synapse:latest

USER root
RUN pip install --no-cache-dir synapse-s3-storage-provider==1.4.0

# Restore the Synapse runtime user
USER 991
