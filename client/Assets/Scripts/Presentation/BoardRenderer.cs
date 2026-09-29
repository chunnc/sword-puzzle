using System.Collections.Generic;
using UnityEngine;
using KiemKhaiTienLo.Core;

namespace KiemKhaiTienLo.Presentation
{
    public sealed class BoardRenderer : MonoBehaviour
    {
        private const float Size = 0.9f;
        private readonly SpriteRenderer[,] cells = new SpriteRenderer[BoardEngine.Width, BoardEngine.Height];
        private readonly SpriteRenderer[,] seals = new SpriteRenderer[BoardEngine.Width, BoardEngine.Height];
        private readonly Dictionary<TileKind, Sprite> sprites = new Dictionary<TileKind, Sprite>();
        private Sprite sealSprite;
        private Camera viewCamera;
        private Vector2 origin;
        private bool visible;

        public void Initialize(Camera camera)
        {
            viewCamera = camera;
            origin = new Vector2(-(BoardEngine.Width - 1) * Size / 2f,
                -(BoardEngine.Height - 1) * Size / 2f - 0.35f);
            for (int kind = 0; kind <= (int)TileKind.Rock; kind++)
                sprites[(TileKind)kind] = CreateSprite((TileKind)kind);
            sealSprite = CreateSeal();
            for (int y = 0; y < BoardEngine.Height; y++)
                for (int x = 0; x < BoardEngine.Width; x++)
                {
                    var tile = new GameObject($"Tile {x},{y}");
                    tile.transform.SetParent(transform, false);
                    tile.transform.position = new Vector3(origin.x + x * Size, origin.y + y * Size, 0);
                    tile.transform.localScale = Vector3.one * Size;
                    cells[x, y] = tile.AddComponent<SpriteRenderer>();
                    cells[x, y].sortingOrder = 10;
                    var seal = new GameObject("Seal");
                    seal.transform.SetParent(tile.transform, false);
                    seals[x, y] = seal.AddComponent<SpriteRenderer>();
                    seals[x, y].sprite = sealSprite;
                    seals[x, y].sortingOrder = 11;
                }
            Hide();
        }

        public void Show(BoardEngine board)
        {
            visible = true;
            foreach (var renderer in cells) renderer.gameObject.SetActive(true);
            UpdateBoard(board);
        }

        public void UpdateBoard(BoardEngine board)
        {
            if (!visible) return;
            for (int y = 0; y < BoardEngine.Height; y++)
                for (int x = 0; x < BoardEngine.Width; x++)
                {
                    Tile tile = board.Get(x, y);
                    cells[x, y].sprite = sprites[tile.Kind];
                    cells[x, y].color = tile.Special == SpecialKind.None ? Color.white :
                        tile.Special == SpecialKind.Omni ? new Color(1f, .72f, 1f) : new Color(1f, .93f, .58f);
                    seals[x, y].enabled = tile.Locked;
                }
        }

        public void Hide()
        {
            visible = false;
            foreach (var renderer in cells)
                if (renderer != null) renderer.gameObject.SetActive(false);
        }

        public bool CellFromScreen(Vector2 screen, out int x, out int y)
        {
            x = y = -1;
            if (!visible || viewCamera == null) return false;
            Vector3 world = viewCamera.ScreenToWorldPoint(new Vector3(screen.x, screen.y, 10));
            x = Mathf.RoundToInt((world.x - origin.x) / Size);
            y = Mathf.RoundToInt((world.y - origin.y) / Size);
            return x >= 0 && x < BoardEngine.Width && y >= 0 && y < BoardEngine.Height &&
                Mathf.Abs(world.x - (origin.x + x * Size)) < Size * .49f &&
                Mathf.Abs(world.y - (origin.y + y * Size)) < Size * .49f;
        }

        private static Sprite CreateSprite(TileKind kind)
        {
            const int n = 96;
            var texture = new Texture2D(n, n, TextureFormat.RGBA32, false);
            texture.filterMode = FilterMode.Bilinear;
            Color dark = new Color(.025f, .17f, .20f, 1f);
            Color jade = new Color(.055f, .28f, .32f, 1f);
            Color gold = new Color(.80f, .63f, .30f, 1f);
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float edge = Mathf.Min(x, y, n - 1 - x, n - 1 - y);
                    bool corner = (x < 12 || x > 83) && (y < 12 || y > 83);
                    float cx = x < 12 ? 12 : x > 83 ? 83 : x;
                    float cy = y < 12 ? 12 : y > 83 ? 83 : y;
                    if (corner && Vector2.Distance(new Vector2(x, y), new Vector2(cx, cy)) > 12)
                    { texture.SetPixel(x, y, Color.clear); continue; }
                    Color color = edge < 3 ? gold : Color.Lerp(dark, jade, (float)y / n);
                    if (edge > 5 && edge < 9) color = Color.Lerp(color, gold, .35f);
                    float px = x - 48, py = y - 48;
                    switch (kind)
                    {
                        case TileKind.Sword:
                            if (Segment(x, y, 27, 28, 68, 71, 4)) color = new Color(.70f, .92f, 1f);
                            if (Segment(x, y, 29, 56, 42, 43, 3)) color = gold;
                            if (Circle(x, y, 24, 23, 5)) color = gold;
                            break;
                        case TileKind.Fire:
                            if (Triangle(x, y, 48, 75, 27, 27, 70, 27) || Circle(x, y, 48, 40, 21))
                                color = new Color(1f, .29f, .12f);
                            if (Triangle(x, y, 50, 63, 39, 29, 60, 29)) color = new Color(1f, .80f, .28f);
                            break;
                        case TileKind.Lightning:
                            if (Triangle(x, y, 52, 76, 31, 47, 49, 50) ||
                                Triangle(x, y, 43, 47, 64, 46, 40, 19)) color = new Color(.76f, .50f, 1f);
                            break;
                        case TileKind.Stone:
                            if (Mathf.Abs(px) / 27f + Mathf.Abs(py) / 34f < 1f)
                                color = new Color(.12f, .85f, .86f);
                            if (Mathf.Abs(px + 8) / 21f + Mathf.Abs(py - 8) / 23f < 1f)
                                color = new Color(.49f, 1f, .97f);
                            break;
                        case TileKind.Herb:
                            if (Segment(x, y, 46, 25, 52, 70, 3)) color = new Color(.43f, .93f, .33f);
                            if (Ellipse(x, y, 36, 56, 17, 10) || Ellipse(x, y, 59, 45, 16, 10))
                                color = new Color(.35f, .91f, .30f);
                            break;
                        case TileKind.Rock:
                            if (Mathf.Abs(px) + Mathf.Abs(py) < 43)
                                color = new Color(.38f + y / 600f, .43f + y / 700f, .45f + y / 700f);
                            if (Segment(x, y, 28, 29, 63, 58, 2)) color = new Color(.21f, .28f, .31f);
                            break;
                    }
                    texture.SetPixel(x, y, color);
                }
            texture.Apply();
            return Sprite.Create(texture, new Rect(0, 0, n, n), new Vector2(.5f, .5f), n);
        }

        private static Sprite CreateSeal()
        {
            const int n = 96;
            var texture = new Texture2D(n, n, TextureFormat.RGBA32, false);
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                    texture.SetPixel(x, y,
                        Segment(x, y, 14, 14, 82, 82, 3) || Segment(x, y, 14, 82, 82, 14, 3)
                            ? new Color(.92f, .72f, .31f, .85f) : Color.clear);
            texture.Apply();
            return Sprite.Create(texture, new Rect(0, 0, n, n), new Vector2(.5f, .5f), n);
        }

        private static bool Circle(float x, float y, float cx, float cy, float r) =>
            (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
        private static bool Ellipse(float x, float y, float cx, float cy, float rx, float ry) =>
            ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry) <= 1f;
        private static bool Segment(float x, float y, float ax, float ay, float bx, float by, float width)
        {
            Vector2 a = new Vector2(ax, ay), b = new Vector2(bx, by), p = new Vector2(x, y);
            float t = Mathf.Clamp01(Vector2.Dot(p - a, b - a) / (b - a).sqrMagnitude);
            return Vector2.Distance(p, a + t * (b - a)) <= width;
        }
        private static bool Triangle(float x, float y, Vector2 a, Vector2 b, Vector2 c)
        {
            float s1 = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
            float s2 = (c.x - b.x) * (y - b.y) - (c.y - b.y) * (x - b.x);
            float s3 = (a.x - c.x) * (y - c.y) - (a.y - c.y) * (x - c.x);
            return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
        }
        private static bool Triangle(float x, float y, float ax, float ay, float bx, float by, float cx, float cy) =>
            Triangle(x, y, new Vector2(ax, ay), new Vector2(bx, by), new Vector2(cx, cy));
    }
}
