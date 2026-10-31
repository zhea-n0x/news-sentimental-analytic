'use client';

import { useState } from 'react';
import { AspectRatio, Box, Image } from '@mantine/core';
import { IconNews } from '@tabler/icons-react';

interface Props {
  src: string | null;
  ratio?: number;
}

/** The article's image, or a quiet neutral placeholder when there is none or it fails to load. */
export function Thumbnail({ src, ratio = 16 / 9 }: Props) {
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <AspectRatio ratio={ratio}>
      {src && failed !== src ? (
        <Image
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
        />
      ) : (
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--mantine-color-gray-light)',
            color: 'var(--mantine-color-gray-5)',
          }}
        >
          <IconNews size={36} stroke={1.25} />
        </Box>
      )}
    </AspectRatio>
  );
}
