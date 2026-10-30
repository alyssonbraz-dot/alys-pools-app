`pool.heic` is a generated, synthetic geometric pool illustration (1200 × 900), not a customer photograph. HEIC is an HEVC-encoded form of the HEIF container. The integration tests exercise these bytes as both `image/heic` and `image/heif`, including format detection without a filename.

Recreate with Python Pillow + pillow-heif (test tooling only; not application dependencies):

```python
from PIL import Image, ImageDraw
import pillow_heif
pillow_heif.register_heif_opener()
im = Image.new('RGB', (1200, 900), '#173e62')
d = ImageDraw.Draw(im)
d.rectangle((80, 80, 1120, 820), fill='#69bccb')
d.ellipse((280, 170, 920, 730), fill='#e7f3fa')
d.text((400, 440), 'ALYS synthetic pool photo', fill='#173e62')
im.save('pool.heic', format='HEIF', quality=90)
```
