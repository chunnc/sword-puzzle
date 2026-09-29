using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using KiemKhaiTienLo.Core;

namespace KiemKhaiTienLo.Presentation
{
    // The board is UI Toolkit artwork, so its tiles and pointer coordinates
    // scale together on narrow phones and on devices with a safe area.
    public sealed class BoardRenderer
    {
        private readonly VisualElement grid;
        private readonly VisualElement[,] cells = new VisualElement[BoardEngine.Width, BoardEngine.Height];
        private readonly VisualElement[,] specials = new VisualElement[BoardEngine.Width, BoardEngine.Height];
        private readonly VisualElement[,] seals = new VisualElement[BoardEngine.Width, BoardEngine.Height];
        private readonly Dictionary<string, Texture2D> textures = new Dictionary<string, Texture2D>();
        private bool pressed;
        private int pointerId;
        private int startX, startY;

        public VisualElement Element { get; }
        public event Action<int, int, int, int> Gesture;

        public BoardRenderer()
        {
            Element = new VisualElement { name = "puzzle-board" };
            Element.AddToClassList("board-frame");
            Element.style.backgroundImage = Art("panel");
            grid = new VisualElement { name = "board-grid", pickingMode = PickingMode.Ignore };
            grid.AddToClassList("board-grid");
            Element.Add(grid);
            for (int displayY = 0; displayY < BoardEngine.Height; displayY++)
            {
                var row = new VisualElement { pickingMode = PickingMode.Ignore };
                row.AddToClassList("board-row");
                grid.Add(row);
                int y = BoardEngine.Height - 1 - displayY;
                for (int x = 0; x < BoardEngine.Width; x++)
                {
                    var cell = new VisualElement { pickingMode = PickingMode.Ignore };
                    cell.AddToClassList("board-cell");
                    row.Add(cell);
                    cells[x, y] = cell;
                    var special = new VisualElement { pickingMode = PickingMode.Ignore };
                    special.AddToClassList("tile-overlay");
                    cell.Add(special);
                    specials[x, y] = special;
                    var seal = new VisualElement { pickingMode = PickingMode.Ignore };
                    seal.AddToClassList("tile-overlay");
                    cell.Add(seal);
                    seals[x, y] = seal;
                }
            }
            Element.RegisterCallback<PointerDownEvent>(OnDown);
            Element.RegisterCallback<PointerUpEvent>(OnUp);
            Element.RegisterCallback<PointerCancelEvent>(OnCancel);
        }

        public void UpdateBoard(BoardEngine board)
        {
            for (int y = 0; y < BoardEngine.Height; y++)
                for (int x = 0; x < BoardEngine.Width; x++)
                {
                    Tile tile = board.Get(x, y);
                    cells[x, y].style.backgroundImage = Art("tile_" + tile.Kind.ToString().ToLowerInvariant());
                    Texture2D special = tile.Special == SpecialKind.Slash ? Art("overlay_slash") :
                        tile.Special == SpecialKind.Omni ? Art("overlay_omni") : null;
                    specials[x, y].style.backgroundImage = special;
                    seals[x, y].style.backgroundImage = tile.Locked ? Art("overlay_seal") : null;
                }
        }

        private Texture2D Art(string name)
        {
            if (!textures.TryGetValue(name, out var texture))
            {
                texture = Resources.Load<Texture2D>("UI/" + name);
                textures[name] = texture;
            }
            return texture;
        }

        private bool CellAt(Vector2 panelPoint, out int x, out int y)
        {
            x = y = -1;
            if (!grid.worldBound.Contains(panelPoint)) return false;
            Vector2 local = grid.WorldToLocal(panelPoint);
            float width = grid.resolvedStyle.width, height = grid.resolvedStyle.height;
            if (width <= 0 || height <= 0) return false;
            x = Mathf.Clamp(Mathf.FloorToInt(local.x * BoardEngine.Width / width), 0, BoardEngine.Width - 1);
            y = BoardEngine.Height - 1 - Mathf.Clamp(Mathf.FloorToInt(local.y * BoardEngine.Height / height), 0,
                BoardEngine.Height - 1);
            return true;
        }

        private void OnDown(PointerDownEvent evt)
        {
            if (!CellAt(evt.position, out startX, out startY)) return;
            pressed = true;
            pointerId = evt.pointerId;
            Element.CapturePointer(pointerId);
            evt.StopPropagation();
        }

        private void OnUp(PointerUpEvent evt)
        {
            if (!pressed || evt.pointerId != pointerId) return;
            pressed = false;
            Element.ReleasePointer(pointerId);
            if (CellAt(evt.position, out int x, out int y)) Gesture?.Invoke(startX, startY, x, y);
            evt.StopPropagation();
        }

        private void OnCancel(PointerCancelEvent evt)
        {
            if (!pressed || evt.pointerId != pointerId) return;
            pressed = false;
            Element.ReleasePointer(pointerId);
        }
    }
}
